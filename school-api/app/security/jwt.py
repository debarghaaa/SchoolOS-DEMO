from __future__ import annotations

import datetime as dt
import uuid

import jwt

from app.core.config import settings
from app.core.errors import InvalidToken
from app.models.base import utcnow

ALGORITHM = "HS256"


def _base_claims(ttl: dt.timedelta, token_type: str) -> dict:
    now = utcnow()
    return {
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
        "jti": uuid.uuid4().hex,
        "type": token_type,
    }


def create_access_token(*, user_id: uuid.UUID, role: str, tenant_id: uuid.UUID | None,
                        refresh_jti: str | None = None) -> str:
    claims = _base_claims(dt.timedelta(minutes=settings.ACCESS_TOKEN_MINUTES), "access")
    claims.update({"sub": str(user_id), "role": role, "tenant_id": str(tenant_id) if tenant_id else None,
                   "rid": refresh_jti})
    return jwt.encode(claims, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(*, user_id: uuid.UUID, tenant_id: uuid.UUID | None,
                         role: str) -> tuple[str, str]:
    """Return (token, jti). The session's tenant + role ride along so refresh
    can re-validate membership instead of blindly re-issuing."""
    claims = _base_claims(dt.timedelta(days=settings.REFRESH_TOKEN_DAYS), "refresh")
    claims.update({"sub": str(user_id), "tenant_id": str(tenant_id) if tenant_id else None,
                   "role": role})
    return jwt.encode(claims, settings.SECRET_KEY, algorithm=ALGORITHM), claims["jti"]


def create_file_token(*, file_id: uuid.UUID, tenant_id: uuid.UUID, ttl_minutes: int = 15) -> str:
    claims = _base_claims(dt.timedelta(minutes=ttl_minutes), "file")
    claims.update({"file_id": str(file_id), "tenant_id": str(tenant_id)})
    return jwt.encode(claims, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str, *, expected_type: str) -> dict:
    try:
        claims = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise InvalidToken("Token has expired.")
    except jwt.InvalidTokenError:
        raise InvalidToken("Invalid token.")
    if claims.get("type") != expected_type:
        raise InvalidToken("Invalid token type.")
    return claims
