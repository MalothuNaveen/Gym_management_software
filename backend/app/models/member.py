"""Members, membership plans and the memberships that link them."""
from datetime import date
from decimal import Decimal

from sqlalchemy import (
    Boolean, Date, ForeignKey, Index, Integer, Numeric, String, Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import MembershipStatus

MONEY = Numeric(12, 2)


class MembershipPlan(Base, TimestampMixin):
    """A sellable plan, e.g. '3 Months' / Rs.2500 / 90 days.

    Deactivated rather than deleted, so historical memberships keep a live FK.
    """

    __tablename__ = "membership_plans"
    __table_args__ = (
        UniqueConstraint("gym_id", "name", name="uq_plan_gym_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gym_id: Mapped[int] = mapped_column(
        ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    price: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Member(Base, TimestampMixin):
    __tablename__ = "members"
    __table_args__ = (
        UniqueConstraint("gym_id", "member_code", name="uq_member_gym_code"),
        Index("ix_members_gym_name", "gym_id", "full_name"),
        Index("ix_members_gym_phone", "gym_id", "phone"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gym_id: Mapped[int] = mapped_column(
        ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_code: Mapped[str] = mapped_column(String(24), nullable=False)

    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    whatsapp: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(160), index=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    gender: Mapped[str | None] = mapped_column(String(10))
    address: Mapped[str | None] = mapped_column(Text)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(120))
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(20))
    notes: Mapped[str | None] = mapped_column(Text)

    photo_key: Mapped[str | None] = mapped_column(String(255))
    joined_on: Mapped[date] = mapped_column(Date, nullable=False)
    # Archive flag - members are never hard-deleted (financial history).
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    memberships: Mapped[list["Membership"]] = relationship(
        back_populates="member", order_by="Membership.start_date.desc()"
    )


class Membership(Base, TimestampMixin):
    """One purchased term. A renewal creates a new row; old rows are kept."""

    __tablename__ = "memberships"
    __table_args__ = (
        Index("ix_memberships_gym_end", "gym_id", "end_date"),
        Index("ix_memberships_member", "member_id", "end_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gym_id: Mapped[int] = mapped_column(
        ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False
    )
    plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("membership_plans.id", ondelete="RESTRICT")
    )
    # Snapshot: the receipt must still read correctly if the plan is renamed.
    plan_name: Mapped[str] = mapped_column(String(80), nullable=False)

    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)

    fee: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    discount: Mapped[Decimal] = mapped_column(
        MONEY, default=Decimal("0.00"), nullable=False
    )
    final_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)

    status: Mapped[str] = mapped_column(
        String(16), default=MembershipStatus.ACTIVE.value, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    member: Mapped[Member] = relationship(back_populates="memberships")
    plan: Mapped[MembershipPlan | None] = relationship()
