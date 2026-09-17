"""Shared FastAPI dependencies: the current user, gym scope, and dates."""
from datetime import date, datetime
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, Header, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import AppError
from app.models import Gym, GymSettings, User
from app.security import decode_access_token

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AppError("Please sign in to continue.", status.HTTP_401_UNAUTHORIZED)

    payload = decode_access_token(authorization.split(" ", 1)[1].strip())
    if not payload:
        raise AppError("Your session has expired. Please sign in again.",
                       status.HTTP_401_UNAUTHORIZED)

    user = db.get(User, int(payload.get("sub", 0)))
    if not user or not user.is_active:
        raise AppError("Your session has expired. Please sign in again.",
                       status.HTTP_401_UNAUTHORIZED)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_owner_or_admin(user: CurrentUser) -> User:
    """Guards the few destructive / configuration endpoints."""
    if user.role not in ("owner", "admin"):
        raise AppError("You do not have permission to do that.",
                       status.HTTP_403_FORBIDDEN)
    return user


AdminUser = Annotated[User, Depends(require_owner_or_admin)]


def get_gym_settings(db: Session, gym_id: int) -> GymSettings:
    row = db.scalar(select(GymSettings).where(GymSettings.gym_id == gym_id))
    if not row:
        raise AppError("Gym settings are not configured yet.")
    return row


def get_gym(db: Session, gym_id: int) -> Gym:
    gym = db.get(Gym, gym_id)
    if not gym:
        raise AppError("Gym not found.", status.HTTP_404_NOT_FOUND)
    return gym


def gym_today(db: Session, gym_id: int) -> date:
    """'Today' in the gym's own timezone - a 11pm check-in in Kolkata must not
    land on tomorrow's date because the server runs in UTC."""
    try:
        tz = ZoneInfo(get_gym_settings(db, gym_id).timezone)
    except (ZoneInfoNotFoundError, AppError, ValueError):
        tz = ZoneInfo("Asia/Kolkata")
    return datetime.now(tz).date()


def gym_now(db: Session, gym_id: int) -> datetime:
    try:
        tz = ZoneInfo(get_gym_settings(db, gym_id).timezone)
    except (ZoneInfoNotFoundError, AppError, ValueError):
        tz = ZoneInfo("Asia/Kolkata")
    return datetime.now(tz)
