"""JWT helpers (ported from middleware/authMiddleware.js). Use with FastAPI Depends()."""
import os
from typing import Any, Dict, Optional

import jwt
from fastapi import Depends, HTTPException, Request


def _bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization") or ""
    if not auth.startswith("Bearer "):
        return None
    return auth.split(" ", 1)[1].strip() or None


def get_current_user(request: Request) -> Dict[str, Any]:
    token = _bearer_token(request)
    if not token:
        raise HTTPException(
            status_code=401,
            detail={"success": False, "message": "Not authorized, no token"},
        )
    secret = os.environ.get("JWT_SECRET", "")
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=401,
            detail={"success": False, "message": "Not authorized, token failed"},
        )


def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user.get("role") == "admin":
        return user
    raise HTTPException(
        status_code=403,
        detail={"success": False, "message": "Access denied, Admin role required"},
    )
