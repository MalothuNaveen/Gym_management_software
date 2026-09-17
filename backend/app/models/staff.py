"""Staff records and their salary / advance ledger."""
from datetime import date
from decimal import Decimal

from sqlalchemy import (
    Date, ForeignKey, Index, Integer, Numeric, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import StaffRole, StaffStatus

MONEY = Numeric(12, 2)


class Staff(Base, TimestampMixin):
    """Anyone on the payroll - office staff, trainer, cleaner, owner."""

    __tablename__ = "staff"
    __table_args__ = (Index("ix_staff_gym_name", "gym_id", "full_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gym_id: Mapped[int] = mapped_column(
        ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(160))
    role: Mapped[str] = mapped_column(
        String(20), default=StaffRole.OTHER.value, nullable=False
    )
    joining_date: Mapped[date | None] = mapped_column(Date)
    monthly_salary: Mapped[Decimal] = mapped_column(
        MONEY, default=Decimal("0.00"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(16), default=StaffStatus.ACTIVE.value, nullable=False
    )
    photo_key: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)

    salary_records: Mapped[list["StaffSalaryRecord"]] = relationship(
        back_populates="staff", order_by="StaffSalaryRecord.paid_on.desc()"
    )


class StaffSalaryRecord(Base, TimestampMixin):
    """A salary payment, an advance, or another payout, always attributed to a
    calendar month (`period_month` is stored as the 1st of that month)."""

    __tablename__ = "staff_salary_records"
    __table_args__ = (
        Index("ix_salary_staff_period", "staff_id", "period_month"),
        Index("ix_salary_gym_paid", "gym_id", "paid_on"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gym_id: Mapped[int] = mapped_column(
        ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    staff_id: Mapped[int] = mapped_column(
        ForeignKey("staff.id", ondelete="CASCADE"), nullable=False
    )
    period_month: Mapped[date] = mapped_column(Date, nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    paid_on: Mapped[date] = mapped_column(Date, nullable=False)
    method: Mapped[str | None] = mapped_column(String(20))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    staff: Mapped[Staff] = relationship(back_populates="salary_records")
