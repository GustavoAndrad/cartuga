from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.auth.security import (
    burn_password_check,
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    verify_password,
)
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.utils.errors import UnauthorizedError


def _utcnow() -> datetime:
    """Naive UTC now, matching how MySQL DATETIME columns store/return values."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def authenticate_user(db: Session, email: str, password: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        burn_password_check(password)
        raise UnauthorizedError("Email ou senha inválidos.")
    if not verify_password(password, user.password_hash):
        raise UnauthorizedError("Email ou senha inválidos.")
    return user


def issue_tokens(db: Session, user: User) -> tuple[str, str]:
    """Creates an access token and a fresh, persisted refresh token. Returns (access, raw_refresh)."""
    access_token = create_access_token(user.id, user.role.value)
    raw_refresh, token_hash, expires_at = generate_refresh_token()

    db.add(RefreshToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at))
    db.commit()

    return access_token, raw_refresh


def rotate_refresh_token(db: Session, raw_refresh_token: str) -> tuple[User, str, str]:
    """Validates + revokes the given refresh token and issues a new pair. Returns (user, access, raw_refresh)."""
    token_hash = hash_refresh_token(raw_refresh_token)
    record = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()

    now = _utcnow()
    if record is None or record.revoked_at is not None or record.expires_at < now:
        raise UnauthorizedError("Sessão expirada. Faça login novamente.")

    record.revoked_at = now
    user = db.get(User, record.user_id)
    if user is None:
        raise UnauthorizedError("Usuário não encontrado.")

    access_token, new_raw_refresh = issue_tokens(db, user)
    return user, access_token, new_raw_refresh


def revoke_refresh_token(db: Session, raw_refresh_token: str) -> None:
    token_hash = hash_refresh_token(raw_refresh_token)
    record = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if record is not None and record.revoked_at is None:
        record.revoked_at = _utcnow()
        db.commit()


def revoke_all_refresh_tokens_for_user(db: Session, user_id: int) -> None:
    """Used on password change so previously issued sessions stop being renewable."""
    now = _utcnow()
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
    ).update({RefreshToken.revoked_at: now})
    db.commit()
