from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_admin
from app.auth.security import hash_password, verify_password
from app.database.session import get_db
from app.models.user import User
from app.schemas.user import (
    ChangePasswordRequest,
    UserAdminUpdate,
    UserCreate,
    UserOut,
    UserUpdateMe,
    UserUpdatePhoto,
)
from app.services import user_service
from app.services.auth_service import revoke_all_refresh_tokens_for_user
from app.utils.errors import ConflictError, ValidationAppError

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
def update_me(
    payload: UserUpdateMe,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.email is not None and payload.email != current_user.email:
        exists = db.query(User).filter(User.email == payload.email).first()
        if exists is not None:
            raise ConflictError("Este email já está em uso.")
        current_user.email = payload.email

    if payload.name is not None:
        current_user.name = payload.name

    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/me/password", status_code=204)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise ValidationAppError("Senha atual incorreta.")
    if len(payload.new_password) < 8:
        raise ValidationAppError("A nova senha deve ter ao menos 8 caracteres.")

    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    revoke_all_refresh_tokens_for_user(db, current_user.id)


@router.put("/me/photo", response_model=UserOut)
def update_photo(
    payload: UserUpdatePhoto,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.photo = payload.photo
    db.commit()
    db.refresh(current_user)
    return current_user


# ---- Admin-only user management. Registered after the /me routes above so a literal
# "/users/me" request is never swallowed by the "/users/{user_id}" pattern. ----


@router.get("", response_model=list[UserOut], dependencies=[Depends(require_admin)])
def list_users(db: Session = Depends(get_db)):
    return user_service.list_users(db)


@router.post("", response_model=UserOut, status_code=201, dependencies=[Depends(require_admin)])
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    return user_service.create_user(db, payload)


@router.get("/{user_id}", response_model=UserOut, dependencies=[Depends(require_admin)])
def get_user(user_id: int, db: Session = Depends(get_db)):
    return user_service.get_user(db, user_id)


@router.put("/{user_id}", response_model=UserOut, dependencies=[Depends(require_admin)])
def update_user(user_id: int, payload: UserAdminUpdate, db: Session = Depends(get_db)):
    return user_service.update_user(db, user_id, payload)


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user_service.delete_user(db, admin_user.id, user_id)
