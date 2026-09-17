"""Payments, receipts and gym expenses."""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import PaymentKind

MONEY = Numeric(12, 2)


class Payment(Base, TimestampMixin):
    """Append-only money-in record.

    A payment is never edited or deleted. A mistake is corrected by voiding the
    row (which keeps it visible in history but excludes it from balances).
    """

    __tablename__ = "payments"
    __table_args__ = (
        Index("ix_payments_gym_date", "gym_id", "paid_on"),
        Index("ix_payments_member", "member_id", "paid_on"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gym_id: Mapped[int] = mapped_column(
        ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="RESTRICT"), nullable=False
    )
    # NULL for an advance that is not yet tied to a specific term.
    membership_id: Mapped[int | None] = mapped_column(
        ForeignKey("memberships.id", ondelete="SET NULL")
    )

    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False)
    kind: Mapped[str] = mapped_column(
        String(16), default=PaymentKind.MEMBERSHIP.value, nullable=False
    )
    paid_on: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    void_reason: Mapped[str | None] = mapped_column(Text)

    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    receipt: Mapped["Receipt | None"] = relationship(
        back_populates="payment", uselist=False
    )

    @property
    def is_void(self) -> bool:
        return self.voided_at is not None


class Receipt(Base, TimestampMixin):
    """An immutable, numbered document for one payment.

    `snapshot_json` freezes every value printed on the PDF so a reprint years
    later is byte-identical even if the member, plan or gym details change.
    """

    __tablename__ = "receipts"
    __table_args__ = (
        UniqueConstraint("gym_id", "receipt_no", name="uq_receipt_gym_no"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gym_id: Mapped[int] = mapped_column(
        ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    payment_id: Mapped[int] = mapped_column(
        ForeignKey("payments.id", ondelete="RESTRICT"), unique=True, nullable=False
    )
    receipt_no: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    issued_on: Mapped[date] = mapped_column(Date, nullable=False)
    snapshot_json: Mapped[str] = mapped_column(Text, nullable=False)

    payment: Mapped[Payment] = relationship(back_populates="receipt")


class Expense(Base, TimestampMixin):
    """Money out. Deliberately not a general ledger - just a spend log."""

    __tablename__ = "expenses"
    __table_args__ = (Index("ix_expenses_gym_date", "gym_id", "expense_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gym_id: Mapped[int] = mapped_column(
        ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    method: Mapped[str | None] = mapped_column(String(20))
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
