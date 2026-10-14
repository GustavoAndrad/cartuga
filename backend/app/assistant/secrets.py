"""Encryption at rest for users' own LLM API keys (Fernet: AES-128-CBC + HMAC).

The key comes from ASSISTANT_ENCRYPTION_KEY or, when that's unset, is derived from
JWT_SECRET (HKDF). Either way, changing it makes previously saved keys unreadable -
users are then asked to save theirs again; nothing breaks beyond that.
"""

import base64

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.config import get_settings


class UnreadableSecretError(Exception):
    pass


def _fernet() -> Fernet:
    settings = get_settings()
    material = (settings.assistant_encryption_key or settings.jwt_secret).encode()
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=b"cartuga-assistant", info=b"llm-api-keys").derive(material)
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        raise UnreadableSecretError()


def hint(plaintext: str) -> str:
    """What the UI may show of a saved key: just enough to recognize it."""
    return f"…{plaintext[-4:]}" if len(plaintext) >= 8 else "…"
