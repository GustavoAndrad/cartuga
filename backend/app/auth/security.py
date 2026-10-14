import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.config import get_settings

settings = get_settings()
_hasher = PasswordHasher()
# Checked when the e-mail doesn't exist, so that answer takes as long as a wrong
# password - response time doesn't reveal which e-mails have an account.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def burn_password_check(password: str) -> None:
    verify_password(password, _DUMMY_HASH)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def create_access_token(user_id: int, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def generate_refresh_token() -> tuple[str, str, datetime]:
    """Returns (plaintext_token, sha256_hash, expires_at). expires_at is naive UTC,
    matching how MySQL DATETIME columns store/return values in this codebase."""
    raw = secrets.token_urlsafe(48)
    token_hash = hash_refresh_token(raw)
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(
        days=settings.refresh_token_expire_days
    )
    return raw, token_hash, expires_at


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_temp_password() -> str:
    """Cryptographically random temporary password for imported users (never predictable)."""
    return secrets.token_urlsafe(12)
