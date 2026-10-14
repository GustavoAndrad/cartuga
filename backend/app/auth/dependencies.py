import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.security import decode_access_token
from app.database.session import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.utils.errors import ForbiddenError, UnauthorizedError

_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise UnauthorizedError("Token de acesso ausente.")

    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise UnauthorizedError("Token de acesso expirado.")
    except jwt.InvalidTokenError:
        raise UnauthorizedError("Token de acesso inválido.")

    user_id = payload.get("sub")
    if user_id is None:
        raise UnauthorizedError("Token de acesso inválido.")

    user = db.get(User, int(user_id))
    if user is None:
        raise UnauthorizedError("Usuário não encontrado.")

    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.ADMIN:
        raise ForbiddenError("Somente administradores podem acessar este recurso.")
    return user
