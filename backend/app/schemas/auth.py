"""Login and account schemas."""
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import Name, ORMModel, OptStr


class LoginIn(BaseModel):
    # Accepts either an email address or a mobile number.
    identifier: str = Field(min_length=3, max_length=160)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("identifier")
    @classmethod
    def _trim(cls, v: str) -> str:
        return v.strip()


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserOut(ORMModel):
    id: int
    gym_id: int
    full_name: str
    email: str
    phone: str | None = None
    role: str
    is_active: bool
    last_login_at: datetime | None = None


class UserCreate(BaseModel):
    full_name: Name
    email: str
    password: str = Field(min_length=8, max_length=72)
    phone: OptStr = None
    role: str = "staff"

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("must be a valid email address")
        return v

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        if v not in ("owner", "admin", "staff"):
            raise ValueError("must be owner, admin or staff")
        return v


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=72)
