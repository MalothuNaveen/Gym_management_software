"""Membership dates, status and the member financial summary.

All of this is computed on the server. The frontend only displays what it is
given - it never decides whether someone is active or how much they owe.
"""
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import Member, Membership, Payment
from app.models.enums import MemberStatus, MembershipStatus
from app.services.money import ZERO, money, subtract


def compute_end_date(start: date, duration_days: int) -> date:
    """A 30-day plan starting 1 Jan runs through 30 Jan inclusive.

    The start day counts as day one, so the term ends on start + (days - 1).
    """
    if duration_days < 1:
        raise AppError("A plan must last at least one day.", field="duration_days")
    return start + timedelta(days=duration_days - 1)


def validate_term(start: date, end: date) -> None:
    if end < start:
        raise AppError("The end date cannot be before the start date.",
                       field="end_date")


def next_start_date(current_end: date | None, today: date) -> date:
    """Where a renewal should begin.

    If the current term is still running, the new one picks up the day after it
    ends, so the member never loses paid days. If it has already lapsed, the new
    term starts today.
    """
    if current_end and current_end >= today:
        return current_end + timedelta(days=1)
    return today


def membership_status(m: Membership, today: date) -> str:
    if m.status == MembershipStatus.CANCELLED.value:
        return MembershipStatus.CANCELLED.value
    return (MembershipStatus.ACTIVE.value if m.end_date >= today
            else MembershipStatus.EXPIRED.value)


def current_membership(db: Session, member_id: int) -> Membership | None:
    """The term that decides a member's status: the one ending furthest out."""
    return db.scalar(
        select(Membership)
        .where(Membership.member_id == member_id,
               Membership.status != MembershipStatus.CANCELLED.value)
        .order_by(Membership.end_date.desc(), Membership.id.desc())
        .limit(1)
    )


def member_status(member: Member, current: Membership | None, today: date,
                  expiring_soon_days: int) -> str:
    if not member.is_active:
        return MemberStatus.ARCHIVED.value
    if current is None:
        return MemberStatus.NO_MEMBERSHIP.value
    if current.end_date < today:
        return MemberStatus.EXPIRED.value
    if current.end_date <= today + timedelta(days=expiring_soon_days):
        return MemberStatus.EXPIRING_SOON.value
    return MemberStatus.ACTIVE.value


def days_remaining(current: Membership | None, today: date) -> int | None:
    if current is None:
        return None
    return (current.end_date - today).days


# --- Money ----------------------------------------------------------------

def _live_payments_filter(member_id: int):
    return and_(Payment.member_id == member_id, Payment.voided_at.is_(None))


def member_financials(db: Session, member_id: int) -> dict[str, Decimal]:
    """The single source of truth for what a member owes.

        total_charged = every non-cancelled membership's final amount
        total_paid    = every payment that has not been voided
        balance       = charged - paid

    A positive balance is money due. A negative balance is an advance the member
    has already paid, shown as credit. This one formula covers full payments,
    partial payments and advances without any special cases.
    """
    charged = db.scalar(
        select(func.coalesce(func.sum(Membership.final_amount), 0)).where(
            Membership.member_id == member_id,
            Membership.status != MembershipStatus.CANCELLED.value,
        )
    ) or 0
    paid = db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(_live_payments_filter(member_id))
    ) or 0

    charged_d, paid_d = money(charged), money(paid)
    balance = subtract(charged_d, paid_d)
    return {
        "total_charged": charged_d,
        "total_paid": paid_d,
        "balance": balance if balance > ZERO else ZERO,
        "credit": -balance if balance < ZERO else ZERO,
        "net_balance": balance,
    }


def membership_paid(db: Session, membership_id: int) -> Decimal:
    """How much has been paid against one specific term."""
    total = db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.membership_id == membership_id, Payment.voided_at.is_(None)
        )
    ) or 0
    return money(total)


# --- Query helpers used by the members list and dashboard -----------------

def current_membership_subquery():
    """Latest end_date per member, as a joinable subquery."""
    return (
        select(
            Membership.member_id.label("member_id"),
            func.max(Membership.end_date).label("end_date"),
        )
        .where(Membership.status != MembershipStatus.CANCELLED.value)
        .group_by(Membership.member_id)
        .subquery()
    )


def apply_status_filter(stmt: Select, sub, status: str, today: date,
                        soon_days: int) -> Select:
    soon_cutoff = today + timedelta(days=soon_days)
    if status == MemberStatus.ACTIVE.value:
        return stmt.where(sub.c.end_date >= today)
    if status == MemberStatus.EXPIRED.value:
        return stmt.where(or_(sub.c.end_date < today, sub.c.end_date.is_(None)))
    if status == MemberStatus.EXPIRING_SOON.value:
        return stmt.where(and_(sub.c.end_date >= today,
                               sub.c.end_date <= soon_cutoff))
    if status == MemberStatus.NO_MEMBERSHIP.value:
        return stmt.where(sub.c.end_date.is_(None))
    return stmt
