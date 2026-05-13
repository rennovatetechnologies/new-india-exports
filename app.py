import hmac
import hashlib
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from pymongo import MongoClient
from pymongo.errors import ConfigurationError

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _utcnow():
    return datetime.now(timezone.utc)


def _get_mongo_db():
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        return None
    client = MongoClient(uri)
    try:
        return client.get_default_database()
    except ConfigurationError:
        return client[os.environ.get("MONGODB_DB_NAME", "test")]


_db = None


def get_db():
    global _db
    if _db is None and os.environ.get("MONGODB_URI"):
        _db = _get_mongo_db()
    return _db


def get_razorpay_keys():
    key_id = os.environ.get("RAZORPAY_KEY_ID")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET")
    if not key_id or not key_secret or key_id == "YOUR_KEY_ID":
        raise ValueError("Razorpay Key ID or Secret is missing in backend/.env")
    return key_id, key_secret


def razorpay_create_order(amount: int, currency: str, receipt: str) -> dict:
    key_id, key_secret = get_razorpay_keys()
    url = "https://api.razorpay.com/v1/orders"
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(
            url,
            json={"amount": amount, "currency": currency, "receipt": receipt},
            auth=(key_id, key_secret),
            headers={"Content-Type": "application/json"},
        )
    if resp.status_code == 401:
        err = RuntimeError("unauthorized")
        err.status_code = 401  # type: ignore[attr-defined]
        raise err
    if not resp.is_success:
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text
        raise RuntimeError(f"Razorpay API error {resp.status_code}: {detail}")
    return resp.json()


class CreateOrderBody(BaseModel):
    amount: Optional[int] = None
    currency: str = "INR"
    receipt: Optional[str] = None
    customerDetails: Optional[dict[str, Any]] = Field(default=None)
    bookingDetails: Optional[dict[str, Any]] = Field(default=None)


class VerifyBody(BaseModel):
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    razorpay_signature: Optional[str] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.environ.get("MONGODB_URI"):
        try:
            get_db()
            logger.info("MongoDB client initialized")
        except Exception as e:
            logger.error("MongoDB Connection Error: %s", e)
    else:
        logger.warning("MONGODB_URI not set; DB features will be skipped")
    yield


app = FastAPI(title="New India Export Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info("%s - %s %s", _utcnow().isoformat(), request.method, request.url.path)
    return await call_next(request)


@app.exception_handler(Exception)
async def global_error_handler(request: Request, err: Exception):
    if isinstance(err, RequestValidationError):
        return await request_validation_exception_handler(request, err)
    if isinstance(err, HTTPException):
        detail = err.detail
        if isinstance(detail, dict):
            return JSONResponse(status_code=err.status_code, content=detail)
        return JSONResponse(status_code=err.status_code, content={"detail": detail})
    logger.exception("GLOBAL ERROR: %s", err)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal Server Error (Caught by Global)",
            "error": str(err),
        },
    )


@app.post("/api/payment/create-order")
def create_order(body: CreateOrderBody):
    try:
        receipt = body.receipt or f"receipt_{int(_utcnow().timestamp() * 1000)}"
        amount = body.amount

        if amount is None or amount < 100:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Minimum amount must be 100 paise"},
            )

        razorpay_order = razorpay_create_order(int(amount), body.currency, receipt)

        db = get_db()
        if db is not None:
            try:
                db.orders.insert_one(
                    {
                        "razorpayOrderId": razorpay_order["id"],
                        "amount": amount,
                        "currency": body.currency,
                        "status": "created",
                        "customerDetails": body.customerDetails or {},
                        "bookingDetails": body.bookingDetails or {},
                        "createdAt": _utcnow(),
                    }
                )
            except Exception as db_err:
                logger.warning(
                    "Order not saved to DB (Database may be disconnected): %s",
                    db_err,
                )

        return {"success": True, "order": razorpay_order}
    except ValueError as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": str(e)},
        )
    except RuntimeError as e:
        if getattr(e, "status_code", None) == 401:
            return JSONResponse(
                status_code=401,
                content={
                    "success": False,
                    "message": "Authentication failed. Please check your Razorpay keys.",
                },
            )
        logger.exception("Error creating Razorpay order")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "Failed to create order",
                "error": str(e),
            },
        )
    except Exception as e:
        logger.exception("Error creating Razorpay order")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "Failed to create order",
                "error": str(e),
            },
        )


@app.post("/api/payment/verify")
def verify_payment(body: VerifyBody):
    try:
        if (
            not body.razorpay_order_id
            or not body.razorpay_payment_id
            or not body.razorpay_signature
        ):
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Missing required payment fields",
                },
            )

        key_secret = os.environ.get("RAZORPAY_KEY_SECRET") or "YOUR_KEY_SECRET"
        payload = f"{body.razorpay_order_id}|{body.razorpay_payment_id}"
        expected_signature = hmac.new(
            key_secret.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        if expected_signature == body.razorpay_signature:
            db = get_db()
            if db is not None:
                try:
                    db.payments.insert_one(
                        {
                            "razorpayOrderId": body.razorpay_order_id,
                            "razorpayPaymentId": body.razorpay_payment_id,
                            "razorpaySignature": body.razorpay_signature,
                            "verified": True,
                            "createdAt": _utcnow(),
                        }
                    )
                    db.orders.update_one(
                        {"razorpayOrderId": body.razorpay_order_id},
                        {"$set": {"status": "paid"}},
                    )
                except Exception as db_err:
                    logger.warning("Payment details not saved to DB: %s", db_err)

            return {"success": True, "message": "Payment verified successfully"}

        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "Invalid signature"},
        )
    except Exception as e:
        logger.exception("Error verifying payment")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "Internal server error",
                "error": str(e),
            },
        )


@app.get("/")
def health():
    return {"status": "New India Export Backend Running"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "5001"))
    reload = os.environ.get("RELOAD") == "1"
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=port,
        reload=reload,
    )
