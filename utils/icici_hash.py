"""ICICI PGPay v2 secure hash helpers (ported from utils/iciciHash.js)."""
import hmac
import hashlib
from typing import Any, Dict


def generate_secure_hash(payload: Dict[str, Any], secret: str) -> str:
    keys = sorted(payload.keys())
    parts = []
    for k in keys:
        val = payload[k]
        if val is None:
            parts.append("")
        else:
            parts.append(str(val))
    val_string = "".join(parts)
    return (
        hmac.new(secret.encode("utf-8"), val_string.encode("utf-8"), hashlib.sha256)
        .hexdigest()
        .lower()
    )


def verify_secure_hash(payload: Dict[str, Any], received_hash: str, secret: str) -> bool:
    p = {**payload}
    p.pop("secureHash", None)
    calculated = generate_secure_hash(p, secret)
    return calculated == str(received_hash).lower()
