"""Payments and receipts."""
from datetime import date

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import func, or_, select

from app.deps import AdminUser, CurrentUser, DbSession, get_gym, gym_today
from app.errors import NotFound
from app.models import Member, Payment, Receipt
from app.schemas.common import Page, paginate
from app.schemas.finance import (
    PaymentIn, PaymentOut, PaymentVoidIn, ReceiptOut,
)
from app.services.payments import record_payment, void_payment
from app.services.presenters import payment_out
from app.services.receipt_pdf import render_receipt_pdf
from app.services.receipts import get_or_create_receipt, snapshot_of
from app.services.storage import get_storage

router = APIRouter(tags=["payments"])


# --------------------------------------------------------------------------
# Payments
# --------------------------------------------------------------------------
@router.get("/payments", response_model=Page[PaymentOut])
def list_payments(
    user: CurrentUser,
    db: DbSession,
    q: str | None = Query(None, description="Member name, ID or receipt number"),
    member_id: int | None = None,
    method: str | None = None,
    start: date | None = None,
    end: date | None = None,
    include_void: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    stmt = select(Payment).where(Payment.gym_id == user.gym_id)
    if not include_void:
        stmt = stmt.where(Payment.voided_at.is_(None))
    if member_id:
        stmt = stmt.where(Payment.member_id == member_id)
    if method:
        stmt = stmt.where(Payment.method == method)
    if start:
        stmt = stmt.where(Payment.paid_on >= start)
    if end:
        stmt = stmt.where(Payment.paid_on <= end)

    if q:
        term = f"%{q.strip().lower()}%"
        digits = "".join(c for c in q if c.isdigit())
        conditions = [
            func.lower(Member.full_name).like(term),
            func.lower(Member.member_code).like(term),
            func.lower(func.coalesce(Receipt.receipt_no, "")).like(term),
        ]
        if digits:
            conditions.append(Member.phone.like(f"%{digits}%"))
        stmt = (
            stmt.join(Member, Member.id == Payment.member_id)
            .outerjoin(Receipt, Receipt.payment_id == Payment.id)
            .where(or_(*conditions))
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Payment.paid_on.desc(), Payment.id.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )
    return paginate([payment_out(db, p) for p in rows], total, page, page_size)


@router.post("/payments", response_model=PaymentOut,
             status_code=status.HTTP_201_CREATED)
def create_payment(payload: PaymentIn, user: CurrentUser, db: DbSession):
    """Record a payment and issue its receipt in one step."""
    gym_id = user.gym_id
    today = gym_today(db, gym_id)

    member = db.get(Member, payload.member_id)
    if not member or member.gym_id != gym_id:
        raise NotFound("member")

    payment = record_payment(
        db,
        member=member,
        amount=payload.amount,
        method=payload.method,
        paid_on=payload.paid_on or today,
        today=today,
        membership_id=payload.membership_id,
        kind=payload.kind,
        notes=payload.notes,
        user_id=user.id,
    )
    get_or_create_receipt(db, payment)
    db.commit()
    db.refresh(payment)
    return payment_out(db, payment)


@router.get("/payments/{payment_id}", response_model=PaymentOut)
def get_payment(payment_id: int, user: CurrentUser, db: DbSession):
    payment = db.get(Payment, payment_id)
    if not payment or payment.gym_id != user.gym_id:
        raise NotFound("payment")
    return payment_out(db, payment)


@router.post("/payments/{payment_id}/void", response_model=PaymentOut)
def cancel_payment(payment_id: int, payload: PaymentVoidIn, admin: AdminUser,
                   db: DbSession):
    """Mark a payment as cancelled. The row is kept, never deleted."""
    payment = db.get(Payment, payment_id)
    if not payment or payment.gym_id != admin.gym_id:
        raise NotFound("payment")
    void_payment(db, payment, payload.reason)
    db.commit()
    db.refresh(payment)
    return payment_out(db, payment)


# --------------------------------------------------------------------------
# Receipts
# --------------------------------------------------------------------------
def _get_receipt(db, gym_id: int, receipt_id: int) -> Receipt:
    receipt = db.get(Receipt, receipt_id)
    if not receipt or receipt.gym_id != gym_id:
        raise NotFound("receipt")
    return receipt


@router.post("/payments/{payment_id}/receipt", response_model=ReceiptOut)
def issue_receipt(payment_id: int, user: CurrentUser, db: DbSession):
    """Idempotent - asking again returns the receipt already issued."""
    payment = db.get(Payment, payment_id)
    if not payment or payment.gym_id != user.gym_id:
        raise NotFound("payment")
    receipt = get_or_create_receipt(db, payment)
    db.commit()
    db.refresh(receipt)
    return ReceiptOut(
        id=receipt.id, receipt_no=receipt.receipt_no, issued_on=receipt.issued_on,
        payment_id=receipt.payment_id, member_id=payment.member_id,
        snapshot=snapshot_of(receipt),
    )


@router.get("/receipts/{receipt_id}", response_model=ReceiptOut)
def get_receipt(receipt_id: int, user: CurrentUser, db: DbSession):
    receipt = _get_receipt(db, user.gym_id, receipt_id)
    return ReceiptOut(
        id=receipt.id, receipt_no=receipt.receipt_no, issued_on=receipt.issued_on,
        payment_id=receipt.payment_id,
        member_id=receipt.payment.member_id if receipt.payment else None,
        snapshot=snapshot_of(receipt),
    )


@router.get("/receipts/{receipt_id}/pdf")
def download_receipt(receipt_id: int, user: CurrentUser, db: DbSession,
                     size: str = Query("a4", pattern="^(a4|thermal)$")):
    """The PDF the owner downloads, prints or shares on WhatsApp."""
    receipt = _get_receipt(db, user.gym_id, receipt_id)
    snapshot = snapshot_of(receipt)

    logo_bytes = None
    gym = get_gym(db, user.gym_id)
    if gym.logo_key:
        try:
            logo_bytes = get_storage().load(gym.logo_key)
        except Exception:  # a missing logo must not block the receipt
            logo_bytes = None

    pdf = render_receipt_pdf(snapshot, logo_bytes, size=size)
    filename = f"Receipt-{receipt.receipt_no}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, max-age=600",
        },
    )
