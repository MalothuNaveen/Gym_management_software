"""Recording money in.

One function creates every payment in the system, so the rules below hold no
matter which screen the owner used:

  * the amount must be positive
  * the payment is attached to the member's outstanding term when there is one
  * anything paid beyond what is owed is recorded as an advance (credit)
  * nothing is ever overwritten - a correction is a void plus a new payment
"""
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import Member, Membership, Payment
from app.models.enums import PaymentKind
from app.services.membership import membership_paid
from app.services.money import ZERO, money, subtract


def _outstanding_membership(db: Session, member_id: int) -> Membership | None:
    """The oldest term that still has a balance - paid off in order."""
    terms = list(
        db.scalars(
            select(Membership)
            .where(Membership.member_id == member_id,
                   Membership.status != "cancelled")
            .order_by(Membership.start_date.asc(), Membership.id.asc())
        )
    )
    for term in terms:
        if subtract(term.final_amount, membership_paid(db, term.id)) > ZERO:
            return term
    return None


def _latest_membership(db: Session, member_id: int) -> Membership | None:
    return db.scalar(
        select(Membership)
        .where(Membership.member_id == member_id,
               Membership.status != "cancelled")
        .order_by(Membership.end_date.desc(), Membership.id.desc())
        .limit(1)
    )


def record_payment(
    db: Session,
    *,
    member: Member,
    amount: Decimal,
    method: str,
    paid_on: date,
    today: date,
    membership_id: int | None = None,
    kind: str | None = None,
    notes: str | None = None,
    user_id: int | None = None,
) -> Payment:
    amount = money(amount, field="payment amount")
    if amount <= ZERO:
        raise AppError("The payment amount must be more than zero.", field="amount")
    if paid_on > today:
        raise AppError("The payment date cannot be in the future.", field="paid_on")

    membership: Membership | None = None
    if membership_id is not None:
        membership = db.get(Membership, membership_id)
        if not membership or membership.member_id != member.id:
            raise AppError("That membership does not belong to this member.",
                           field="membership_id")
    else:
        # Settle the oldest unpaid term first; otherwise attach to the current
        # term so the receipt can still show the plan and dates.
        membership = (_outstanding_membership(db, member.id)
                      or _latest_membership(db, member.id))

    if kind is None:
        if membership is None:
            kind = PaymentKind.ADVANCE.value
        else:
            due = subtract(membership.final_amount,
                           membership_paid(db, membership.id))
            kind = (PaymentKind.MEMBERSHIP.value if due > ZERO
                    else PaymentKind.ADVANCE.value)

    payment = Payment(
        gym_id=member.gym_id,
        member_id=member.id,
        membership_id=membership.id if membership else None,
        amount=amount,
        method=method,
        kind=kind,
        paid_on=paid_on,
        notes=notes,
        created_by_user_id=user_id,
    )
    db.add(payment)
    db.flush()
    return payment


def void_payment(db: Session, payment: Payment, reason: str) -> Payment:
    """Cancel a payment without erasing it.

    The row stays in history, marked and dated, and stops counting toward any
    balance or collection total. Financial records are never deleted.
    """
    if payment.voided_at is not None:
        raise AppError("This payment has already been cancelled.")
    if payment.receipt is not None:
        raise AppError(
            "A receipt has already been issued for this payment, so it cannot "
            "be cancelled. Record a correcting entry instead."
        )
    payment.voided_at = datetime.now(timezone.utc)
    payment.void_reason = reason
    db.flush()
    return payment
