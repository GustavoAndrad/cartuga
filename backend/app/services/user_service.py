from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.models.user import User
from app.schemas.user import UserAdminUpdate, UserCreate
from app.utils.errors import ConflictError, NotFoundError, ValidationAppError


def list_users(db: Session) -> list[User]:
    return db.query(User).order_by(User.name).all()


def get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("Usuário não encontrado.")
    return user


def create_user(db: Session, payload: UserCreate) -> User:
    if db.query(User).filter(User.email == payload.email).first() is not None:
        raise ConflictError("Este email já está em uso.")

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, user_id: int, payload: UserAdminUpdate) -> User:
    user = get_user(db, user_id)

    if payload.email is not None and payload.email != user.email:
        if db.query(User).filter(User.email == payload.email).first() is not None:
            raise ConflictError("Este email já está em uso.")
        user.email = payload.email

    if payload.name is not None:
        user.name = payload.name
    if payload.role is not None:
        user.role = payload.role

    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, acting_admin_id: int, user_id: int) -> None:
    if acting_admin_id == user_id:
        raise ValidationAppError("Você não pode excluir a própria conta.")

    user = get_user(db, user_id)
    db.delete(user)
    db.commit()
