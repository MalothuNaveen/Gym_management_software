"""Receipt creation. One receipt per payment, numbered and immutable."""
import json
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import AppError, NotFound
from app.models import Gym, Member, Membership, Payment, Receipt
from app.services.membership import member_financials
from app.services.money import format_inr, money
from app.services.sequences import next_receipt_no

DATE_FMT = "%d %b %Y"


def fmt_date(d: date | None) -> str:
    return d.strftime(DATE_FMT) if d else "-"


METHOD_LABELS = {
    "cash": "Cash", "upi": "UPI", "card": "Card",
    "bank_transfer": "Bank Transfer", "other": "Other",
}


def build_snapshot(db: Session, payment: Payment, receipt_no: str) -> dict:
    """Freeze every printed value at the moment the receipt is issued."""
    gym = db.get(Gym, payment.gym_id)
    member = db.get(Member, payment.member_id)
    if not gym or not member:
        raise NotFound("payment")

    membership: Membership | None = (
        db.get(Membership, payment.membership_id) if payment.membership_id else None
    )
    settings_row = gym.settings
    fin = member_financials(db, member.id)

    fee = membership.fee if membership else payment.amount
    discount = membership.discount if membership else money(0)
    final_amount = membership.final_amount if membership else payment.amount

    return {
        "receipt_no": receipt_no,
        "issued_on": fmt_date(payment.paid_on),
        "gym": {
            "name": gym.name,
            "address": gym.address or "",
            "phone": gym.phone or "",
            "email": gym.email or "",
            "logo_key": gym.logo_key,
        },
        "member": {
            "name": member.full_name,
            "code": member.member_code,
            "phone": member.phone,
        },
        "membership": {
            "plan": membership.plan_name if membership else "-",
            "start": fmt_date(membership.start_date) if membership else "-",
            "end": fmt_date(membership.end_date) if membership else "-",
        },
        "amounts": {
            "fee": str(money(fee)),
            "discount": str(money(discount)),
            "final_amount": str(money(final_amount)),
            "paid": str(money(payment.amount)),
            "balance": str(fin["balance"]),
            "credit": str(fin["credit"]),
            "fee_text": format_inr(fee),
            "discount_text": format_inr(discount),
            "final_amount_text": format_inr(final_amount),
            "paid_text": format_inr(payment.amount),
            "balance_text": format_inr(fin["balance"]),
        },
        "payment": {
            "method": METHOD_LABELS.get(payment.method, payment.method.title()),
            "kind": payment.kind,
            "notes": payment.notes or "",
        },
        "footer": settings_row.receipt_footer if settings_row
                  else "Thank you for choosing us!",
        "currency": settings_row.currency if settings_row else "INR",
    }


def get_or_create_receipt(db: Session, payment: Payment) -> Receipt:
    """Idempotent: asking twice for the same payment returns the same number."""
    existing = db.scalar(select(Receipt).where(Receipt.payment_id == payment.id))
    if existing:
        return existing

    if payment.voided_at is not None:
        raise AppError("A receipt cannot be issued for a cancelled payment.")

    receipt_no = next_receipt_no(db, payment.gym_id, payment.paid_on.year)
    snapshot = build_snapshot(db, payment, receipt_no)

    receipt = Receipt(
        gym_id=payment.gym_id,
        payment_id=payment.id,
        receipt_no=receipt_no,
        issued_on=payment.paid_on,
        snapshot_json=json.dumps(snapshot, ensure_ascii=False),
    )
    db.add(receipt)
    db.flush()
    return receipt


def snapshot_of(receipt: Receipt) -> dict:
    return json.loads(receipt.snapshot_json)
