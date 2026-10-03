from __future__ import annotations

import hashlib
import secrets

import bcrypt

from app.core.config import settings


def hash_password(password: str) -> str:
    if len(password.encode()) > 72:
        # bcrypt truncates past 72 bytes; pre-hash to keep full entropy.
        password = hashlib.sha256(password.encode()).hexdigest()
    salt = bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)
    return bcrypt.hashpw(password.encode(), salt).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        candidate = password
        if len(password.encode()) > 72:
            candidate = hashlib.sha256(password.encode()).hexdigest()
        return bcrypt.checkpw(candidate.encode(), password_hash.encode())
    except (ValueError, TypeError):
        return False


def validate_password_strength(password: str) -> str | None:
    """Return an error message when the password is too weak, else None."""
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if len(password) > 128:
        return "Password must be at most 128 characters."
    if password.strip() != password:
        return "Password must not start or end with whitespace."
    return None


def random_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()
