from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.auth.cookies import REFRESH_COOKIE_NAME, clear_refresh_cookie, set_refresh_cookie
from app.auth.rate_limit import login_limiter
from app.auth.dependencies import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.schemas.auth import AccessTokenResponse, LoginRequest
from app.services import auth_service
from app.utils.errors import UnauthorizedError

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=AccessTokenResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    login_limiter.check(ip, payload.email)
    try:
        user = auth_service.authenticate_user(db, payload.email, payload.password)
    except UnauthorizedError:
        login_limiter.failed(ip, payload.email)
        raise
    login_limiter.succeeded(ip, payload.email)
    access_token, raw_refresh = auth_service.issue_tokens(db, user)
    set_refresh_cookie(response, raw_refresh)
    return AccessTokenResponse(access_token=access_token, user=user)


@router.post("/refresh", response_model=AccessTokenResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    raw_refresh = request.cookies.get(REFRESH_COOKIE_NAME)
    if raw_refresh is None:
        raise UnauthorizedError("Sessão expirada. Faça login novamente.")

    user, access_token, new_raw_refresh = auth_service.rotate_refresh_token(db, raw_refresh)
    set_refresh_cookie(response, new_raw_refresh)
    return AccessTokenResponse(access_token=access_token, user=user)


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    raw_refresh = request.cookies.get(REFRESH_COOKIE_NAME)
    if raw_refresh is not None:
        auth_service.revoke_refresh_token(db, raw_refresh)
    clear_refresh_cookie(response)
