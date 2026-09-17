"""Authentication. No public signup - staff accounts are created by the owner."""
from datetime import datetime, timezone

from fastapi import APIRouter, status
from sqlalchemy import func, or_, select

from app.deps import AdminUser, CurrentUser, DbSession
from app.errors import AppError
from app.models import User
from app.schemas.auth import (
    LoginIn, PasswordChange, TokenOut, UserCreate, UserOut,
)
from app.schemas.common import MessageOut
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: DbSession):
    """Sign in with either the email address or the mobile number."""
    identifier = payload.identifier.strip()
    digits = "".join(ch for ch in identifier if ch.isdigit())

    # Only treat the input as a phone number when it really looks like one.
    # Matching on `User.phone == None` would otherwise resolve to `phone IS
    # NULL` and return an unrelated account that has no phone on file.
    conditions = [func.lower(User.email) == identifier.lower()]
    if len(digits) >= 7:
        conditions.append(User.phone == digits)

    user = db.scalar(select(User).where(or_(*conditions)))

    # Same message either way - never reveal whether an account exists.
    if not user or not verify_password(payload.password, user.password_hash):
        raise AppError("Incorrect login details. Please check and try again.",
                       status.HTTP_401_UNAUTHORIZED)
    if not user.is_active:
        raise AppError("This account has been deactivated.",
                       status.HTTP_403_FORBIDDEN)

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    token, expires_in = create_access_token(
        user_id=user.id, gym_id=user.gym_id, role=user.role
    )
    return TokenOut(access_token=token, expires_in=expires_in)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.post("/change-password", response_model=MessageOut)
def change_password(payload: PasswordChange, user: CurrentUser, db: DbSession):
    if not verify_password(payload.current_password, user.password_hash):
        raise AppError("Your current password is not correct.", field="current_password")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return MessageOut(message="Password updated.")


# --- Staff logins (owner/admin only) --------------------------------------

@router.get("/users", response_model=list[UserOut])
def list_users(admin: AdminUser, db: DbSession):
    return list(
        db.scalars(
            select(User).where(User.gym_id == admin.gym_id).order_by(User.id)
        )
    )


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, admin: AdminUser, db: DbSession):
    """Add another login. Designed in from day one, used when the gym grows."""
    if db.scalar(select(User).where(func.lower(User.email) == payload.email)):
        raise AppError("An account with this email already exists.", field="email")

    user = User(
        gym_id=admin.gym_id,
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        role=payload.role,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/status", response_model=UserOut)
def set_user_status(user_id: int, is_active: bool, admin: AdminUser,
                    db: DbSession):
    target = db.get(User, user_id)
    if not target or target.gym_id != admin.gym_id:
        raise AppError("That account could not be found.",
                       status.HTTP_404_NOT_FOUND)
    if target.id == admin.id:
        raise AppError("You cannot deactivate your own account.")
    target.is_active = is_active
    db.commit()
    db.refresh(target)
    return target
