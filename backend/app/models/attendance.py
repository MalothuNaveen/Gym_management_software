"""Daily member check-ins."""
from datetime import date, datetime

from sqlalchemy import (
    Date, DateTime, ForeignKey, Index, Integer, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.member import Member


class Attendance(Base, TimestampMixin):
    """One row per member per day - the unique constraint is what stops an
    accidental double check-in when the owner taps twice."""

    __tablename__ = "attendance"
    __table_args__ = (
        UniqueConstraint(
            "gym_id", "member_id", "attend_date", name="uq_attendance_day"
        ),
        Index("ix_attendance_gym_date", "gym_id", "attend_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gym_id: Mapped[int] = mapped_column(
        ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False
    )
    attend_date: Mapped[date] = mapped_column(Date, nullable=False)
    check_in_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    marked_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    member: Mapped[Member] = relationship()
