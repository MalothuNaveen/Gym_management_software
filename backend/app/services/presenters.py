"""Turn ORM rows into the shapes the UI renders.

Kept separate from the routers so members, dashboard and reports all describe a
member's status and balance in exactly the same way.
"""
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Attendance, Member, Membership, Payment, Receipt, Staff
from app.services.membership import (
    current_membership, days_remaining, member_financials, member_status,
    membership_paid,
)
from app.services.money import ZERO, money, subtract


def membership_out(db: Session, m: Membership, today: date) -> dict:
    paid = membership_paid(db, m.id)
    return {
        "id": m.id,
        "plan_id": m.plan_id,
        "plan_name": m.plan_name,
        "start_date": m.start_date,
        "end_date": m.end_date,
        "fee": money(m.fee),
        "discount": money(m.discount),
        "final_amount": money(m.final_amount),
        "status": ("cancelled" if m.status == "cancelled"
                   else "active" if m.end_date >= today else "expired"),
        "notes": m.notes,
        "paid": paid,
        "balance": max(subtract(m.final_amount, paid), ZERO),
        "days_remaining": (m.end_date - today).days,
    }


def member_detail(db: Session, member: Member, today: date,
                  soon_days: int) -> dict:
    current = current_membership(db, member.id)
    fin = member_financials(db, member.id)

    total_visits = db.scalar(
        select(func.count(Attendance.id)).where(Attendance.member_id == member.id)
    ) or 0
    month_start = today.replace(day=1)
    this_month = db.scalar(
        select(func.count(Attendance.id)).where(
            Attendance.member_id == member.id,
            Attendance.attend_date >= month_start,
            Attendance.attend_date <= today,
        )
    ) or 0
    last_visit = db.scalar(
        select(func.max(Attendance.attend_date)).where(
            Attendance.member_id == member.id
        )
    )

    history = list(
        db.scalars(
            select(Membership)
            .where(Membership.member_id == member.id)
            .order_by(Membership.start_date.desc(), Membership.id.desc())
        )
    )

    return {
        "id": member.id,
        "member_code": member.member_code,
        "full_name": member.full_name,
        "phone": member.phone,
        "whatsapp": member.whatsapp,
        "email": member.email,
        "date_of_birth": member.date_of_birth,
        "gender": member.gender,
        "address": member.address,
        "emergency_contact_name": member.emergency_contact_name,
        "emergency_contact_phone": member.emergency_contact_phone,
        "notes": member.notes,
        "joined_on": member.joined_on,
        "is_active": member.is_active,
        "has_photo": bool(member.photo_key),
        "status": member_status(member, current, today, soon_days),
        "current_membership": membership_out(db, current, today) if current else None,
        "days_remaining": days_remaining(current, today),
        "financials": {
            "total_charged": fin["total_charged"],
            "total_paid": fin["total_paid"],
            "balance": fin["balance"],
            "credit": fin["credit"],
        },
        "attendance": {
            "total_visits": total_visits,
            "this_month": this_month,
            "last_visit": last_visit,
        },
        "memberships": [membership_out(db, m, today) for m in history],
    }


def payment_out(db: Session, p: Payment) -> dict:
    receipt = db.scalar(select(Receipt).where(Receipt.payment_id == p.id))
    member = db.get(Member, p.member_id)
    membership = db.get(Membership, p.membership_id) if p.membership_id else None
    return {
        "id": p.id,
        "member_id": p.member_id,
        "member_name": member.full_name if member else None,
        "member_code": member.member_code if member else None,
        "membership_id": p.membership_id,
        "plan_name": membership.plan_name if membership else None,
        "amount": money(p.amount),
        "method": p.method,
        "kind": p.kind,
        "paid_on": p.paid_on,
        "notes": p.notes,
        "is_void": p.voided_at is not None,
        "void_reason": p.void_reason,
        "receipt_id": receipt.id if receipt else None,
        "receipt_no": receipt.receipt_no if receipt else None,
    }


def staff_out(db: Session, s: Staff, period: date,
              include_records: bool = False) -> dict:
    from app.services.salary import salary_summary

    data = {
        "id": s.id,
        "full_name": s.full_name,
        "phone": s.phone,
        "email": s.email,
        "role": s.role,
        "joining_date": s.joining_date,
        "monthly_salary": money(s.monthly_salary),
        "status": s.status,
        "notes": s.notes,
        "has_photo": bool(s.photo_key),
        "salary": salary_summary(db, s, period),
    }
    if include_records:
        data["salary_records"] = [
            {
                "id": r.id,
                "staff_id": r.staff_id,
                "staff_name": s.full_name,
                "period_month": r.period_month,
                "kind": r.kind,
                "amount": money(r.amount),
                "paid_on": r.paid_on,
                "method": r.method,
                "notes": r.notes,
                "created_at": r.created_at,
            }
            for r in sorted(s.salary_records,
                            key=lambda x: (x.paid_on, x.id), reverse=True)
        ]
    return data


def balances_for_members(db: Session, member_ids: list[int]) -> dict[int, Decimal]:
    """Balances for a whole page of members in two queries, not 2N."""
    if not member_ids:
        return {}
    charged = dict(
        db.execute(
            select(Membership.member_id,
                   func.coalesce(func.sum(Membership.final_amount), 0))
            .where(Membership.member_id.in_(member_ids),
                   Membership.status != "cancelled")
            .group_by(Membership.member_id)
        ).all()
    )
    paid = dict(
        db.execute(
            select(Payment.member_id, func.coalesce(func.sum(Payment.amount), 0))
            .where(Payment.member_id.in_(member_ids), Payment.voided_at.is_(None))
            .group_by(Payment.member_id)
        ).all()
    )
    out: dict[int, Decimal] = {}
    for mid in member_ids:
        balance = subtract(charged.get(mid, 0), paid.get(mid, 0))
        out[mid] = balance if balance > ZERO else ZERO
    return out
