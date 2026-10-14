from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.enums import UserRole
from app.schemas.common import NewPassword, Password, PersonName, PhotoUrl


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    photo: str | None
    role: UserRole
    created_at: datetime
    updated_at: datetime


class UserUpdateMe(BaseModel):
    name: PersonName | None = None
    email: EmailStr | None = None


class UserUpdatePhoto(BaseModel):
    photo: PhotoUrl


class UserCreate(BaseModel):
    name: PersonName
    email: EmailStr
    password: NewPassword
    role: UserRole = UserRole.USER


class UserAdminUpdate(BaseModel):
    name: PersonName | None = None
    email: EmailStr | None = None
    role: UserRole | None = None


class ChangePasswordRequest(BaseModel):
    current_password: Password
    new_password: NewPassword
