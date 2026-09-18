"""Global search: one box that finds a member, a payment, a plan or a staff member.

Each hit carries the route it belongs to, so the browser never has to work out
where a result should take you.
"""
from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select

from app.deps import CurrentUser, DbSession
from app.models import Member, MembershipPlan, Payment, Receipt, Staff
from app.schemas.messaging import SearchGroup, SearchHit, SearchOut
from app.services.money import money_str

router = APIRouter(tags=["search"])

PER_GROUP = 5


@router.get("/search", response_model=SearchOut)
def search(user: CurrentUser, db: DbSession,
           q: str = Query("", max_length=80)):
    term = (q or "").strip()
    if len(term) < 2:
        return SearchOut(query=term, total=0, groups=[])

    gym_id = user.gym_id
    like = f"%{term.lower()}%"
    digits = "".join(ch for ch in term if ch.isdigit())
    groups: list[SearchGroup] = []

    # --- Members ----------------------------------------------------------
    conditions = [
        func.lower(Member.full_name).like(like),
        func.lower(Member.member_code).like(like),
        func.lower(func.coalesce(Member.email, "")).like(like),
    ]
    if digits:
        conditions.append(Member.phone.like(f"%{digits}%"))

    members = list(db.scalars(
        select(Member)
        .where(Member.gym_id == gym_id, or_(*conditions))
        .order_by(Member.full_name)
        .limit(PER_GROUP)
    ))
    if members:
        groups.append(SearchGroup(label="Members", hits=[
            SearchHit(
                id=m.id, title=m.full_name,
                subtitle=f"{m.member_code} · {m.phone}",
                to=f"/members/{m.id}",
                badge=None if m.is_active else "Archived",
            ) for m in members
        ]))

    # --- Payments (by receipt number) -------------------------------------
    payments = db.execute(
        select(Payment, Receipt.receipt_no, Member.full_name)
        .join(Receipt, Receipt.payment_id == Payment.id, isouter=True)
        .join(Member, Member.id == Payment.member_id, isouter=True)
        .where(Payment.gym_id == gym_id,
               or_(func.lower(func.coalesce(Receipt.receipt_no, "")).like(like),
                   func.lower(func.coalesce(Member.full_name, "")).like(like)))
        .order_by(Payment.paid_on.desc())
        .limit(PER_GROUP)
    ).all()
    if payments:
        groups.append(SearchGroup(label="Payments", hits=[
            SearchHit(
                id=p.id,
                title=f"{money_str(p.amount)} · {name or 'Member'}",
                subtitle=f"{receipt_no or 'No receipt'} · {p.paid_on}",
                to="/payments",
                badge="Voided" if p.voided_at else None,
            ) for p, receipt_no, name in payments
        ]))

    # --- Plans ------------------------------------------------------------
    plans = list(db.scalars(
        select(MembershipPlan)
        .where(MembershipPlan.gym_id == gym_id,
               func.lower(MembershipPlan.name).like(like))
        .order_by(MembershipPlan.sort_order)
        .limit(PER_GROUP)
    ))
    if plans:
        groups.append(SearchGroup(label="Membership Plans", hits=[
            SearchHit(
                id=p.id, title=p.name,
                subtitle=f"{money_str(p.price)} · {p.duration_days} days",
                to="/plans",
                badge=None if p.is_active else "Not offered",
            ) for p in plans
        ]))

    # --- Staff ------------------------------------------------------------
    staff_conditions = [func.lower(Staff.full_name).like(like)]
    if digits:
        staff_conditions.append(Staff.phone.like(f"%{digits}%"))
    staff = list(db.scalars(
        select(Staff)
        .where(Staff.gym_id == gym_id, or_(*staff_conditions))
        .order_by(Staff.full_name)
        .limit(PER_GROUP)
    ))
    if staff:
        groups.append(SearchGroup(label="Staff", hits=[
            SearchHit(
                id=s.id, title=s.full_name,
                subtitle=f"{s.role.replace('_', ' ').title()} · {s.phone}",
                to="/staff",
            ) for s in staff
        ]))

    return SearchOut(query=term, total=sum(len(g.hits) for g in groups), groups=groups)
