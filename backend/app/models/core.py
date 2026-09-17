"""Gym (tenant), its settings, and login users."""
from datetime import datetime, time

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, String, Text, Time, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import UserRole


class Gym(Base, TimestampMixin):
    """The tenant root. V1 ships with exactly one row; the FK is already in
    place everywhere so a second gym needs no migration."""

    __tablename__ = "gyms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    address: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(160))
    whatsapp_number: Mapped[str | None] = mapped_column(String(20))
    logo_key: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    settings: Mapped["GymSettings"] = relationship(
        back_populates="gym", uselist=False, cascade="all, delete-orphan"
    )


class GymSettings(Base, TimestampMixin):
    """Owner-editable configuration plus the ID sequence counters.

    Keeping the counters here lets us allocate member codes and receipt numbers
    inside the same transaction as the record they belong to, with a row lock on
    Postgres, so numbers are never reused.
    """

    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gym_id: Mapped[int] = mapped_column(
        ForeignKey("gyms.id", ondelete="CASCADE"), unique=True, nullable=False
    )

    currency: Mapped[str] = mapped_column(String(8), default="INR", nullable=False)
    timezone: Mapped[str] = mapped_column(
        String(64), default="Asia/Kolkata", nullable=False
    )
    receipt_footer: Mapped[str] = mapped_column(
        Text, default="Thank you for choosing us!", nullable=False
    )

    # Membership defaults
    default_plan_id: Mapped[int | None] = mapped_column(Integer)
    expiring_soon_days: Mapped[int] = mapped_column(
        Integer, default=7, nullable=False
    )

    # Business hours (display only)
    open_time: Mapped[time | None] = mapped_column(Time)
    close_time: Mapped[time | None] = mapped_column(Time)

    # --- Sequence counters -------------------------------------------------
    member_code_prefix: Mapped[str] = mapped_column(
        String(12), default="GYM", nullable=False
    )
    member_seq: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    receipt_prefix: Mapped[str] = mapped_column(
        String(12), default="REC", nullable=False
    )
    receipt_year: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    receipt_seq: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    gym: Mapped[Gym] = relationship(back_populates="settings")


class User(Base, TimestampMixin):
    """A login account. No public signup - the owner creates these."""

    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gym_id: Mapped[int] = mapped_column(
        ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        String(20), default=UserRole.OWNER.value, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
