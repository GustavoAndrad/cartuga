from pydantic import BaseModel, EmailStr

from app.schemas.common import Password
from app.schemas.user import UserOut


class LoginRequest(BaseModel):
    email: EmailStr
    password: Password


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
