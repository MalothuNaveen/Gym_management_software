"""Members: list, create, profile, photo, renew."""
from datetime import date, timedelta

from fastapi import APIRouter, File, Query, Response, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.deps import CurrentUser, DbSession, get_gym_settings, gym_today
from app.errors import AppError, NotFound
from app.models import Member, Membership, MembershipPlan, Payment
from app.models.enums import MemberStatus
from app.schemas.common import MessageOut, Page, paginate
from app.schemas.finance import PaymentOut
from app.schemas.member import (
    MemberCreate, MemberCreatedOut, MemberDetail, MemberListItem, MemberUpdate,
    MembershipIn, MembershipOut, RenewIn,
)
from app.schemas.misc import AttendanceOut, ExpiringMemberOut
from app.services.images import process_photo
from app.services.membership import (
    apply_status_filter, compute_end_date, current_membership,
    current_membership_subquery, next_start_date, validate_term,
)
from app.services.money import compute_final_amount, money
from app.services.payments import record_payment
from app.services.presenters import (
    balances_for_members, member_detail, membership_out, payment_out,
)
from app.services.receipts import get_or_create_receipt
from app.services.storage import get_storage, new_key

router = APIRouter(prefix="/members", tags=["members"])


def _get_member(db: Session, gym_id: int, member_id: int) -> Member:
    member = db.get(Member, member_id)
    if not member or member.gym_id != gym_id:
        raise NotFound("member")
    return member


def _build_membership(db: Session, gym_id: int, payload: MembershipIn,
                      user_id: int, member_id: int) -> Membership:
    """Resolve the plan, work out the term and compute the final amount."""
    plan: MembershipPlan | None = None
    if payload.plan_id:
        plan = db.get(MembershipPlan, payload.plan_id)
        if not plan or plan.gym_id != gym_id:
            raise AppError("That membership plan could not be found.",
                           field="plan_id")
        if not plan.is_active and payload.end_date is None:
            raise AppError("That membership plan is no longer available.",
                           field="plan_id")

    end_date = payload.end_date
    if end_date is None:
        duration = payload.duration_days or (plan.duration_days if plan else None)
        if not duration:
            raise AppError("Choose a plan, or set an end date.", field="end_date")
        end_date = compute_end_date(payload.start_date, duration)
    validate_term(payload.start_date, end_date)

    final_amount = compute_final_amount(payload.fee, payload.discount)

    return Membership(
        gym_id=gym_id,
        member_id=member_id,
        plan_id=plan.id if plan else None,
        plan_name=(payload.plan_name or (plan.name if plan else "Custom")),
        start_date=payload.start_date,
        end_date=end_date,
        fee=money(payload.fee, field="membership fee"),
        discount=money(payload.discount, field="discount"),
        final_amount=final_amount,
        notes=payload.notes,
        created_by_user_id=user_id,
    )


# --------------------------------------------------------------------------
# List & search
# --------------------------------------------------------------------------
@router.get("", response_model=Page[MemberListItem])
def list_members(
    user: CurrentUser,
    db: DbSession,
    q: str | None = Query(None, description="Name, phone, member ID or email"),
    status_filter: str = Query("all", alias="status"),
    include_archived: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    gym_id = user.gym_id
    today = gym_today(db, gym_id)
    soon_days = get_gym_settings(db, gym_id).expiring_soon_days

    sub = current_membership_subquery()
    stmt = (
        select(Member, sub.c.end_date)
        .outerjoin(sub, sub.c.member_id == Member.id)
        .where(Member.gym_id == gym_id)
    )
    if not include_archived and status_filter != "archived":
        stmt = stmt.where(Member.is_active.is_(True))
    if status_filter == "archived":
        stmt = stmt.where(Member.is_active.is_(False))

    if q:
        term = f"%{q.strip().lower()}%"
        digits = "".join(ch for ch in q if ch.isdigit())
        conditions = [
            func.lower(Member.full_name).like(term),
            func.lower(Member.member_code).like(term),
            func.lower(func.coalesce(Member.email, "")).like(term),
        ]
        if digits:
            conditions.append(Member.phone.like(f"%{digits}%"))
        stmt = stmt.where(or_(*conditions))

    if status_filter not in ("all", "archived"):
        stmt = apply_status_filter(stmt, sub, status_filter, today, soon_days)

    total = db.scalar(
        select(func.count()).select_from(stmt.subquery())
    ) or 0

    rows = db.execute(
        stmt.order_by(Member.full_name.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    members = [row[0] for row in rows]
    balances = balances_for_members(db, [m.id for m in members])

    items = []
    for member, end_date in rows:
        current = current_membership(db, member.id)
        if not member.is_active:
            member_state = MemberStatus.ARCHIVED.value
        elif end_date is None:
            member_state = MemberStatus.NO_MEMBERSHIP.value
        elif end_date < today:
            member_state = MemberStatus.EXPIRED.value
        elif end_date <= today + timedelta(days=soon_days):
            member_state = MemberStatus.EXPIRING_SOON.value
        else:
            member_state = MemberStatus.ACTIVE.value

        items.append(MemberListItem(
            id=member.id,
            member_code=member.member_code,
            full_name=member.full_name,
            phone=member.phone,
            email=member.email,
            has_photo=bool(member.photo_key),
            status=member_state,
            plan_name=current.plan_name if current else None,
            end_date=end_date,
            days_remaining=(end_date - today).days if end_date else None,
            balance=balances.get(member.id, money(0)),
            is_active=member.is_active,
        ))

    return paginate(items, total, page, page_size)


# --------------------------------------------------------------------------
# Expiring soon  (declared before /{member_id} so the path does not shadow it)
# --------------------------------------------------------------------------
@router.get("/expiring", response_model=list[ExpiringMemberOut])
def expiring_members(user: CurrentUser, db: DbSession,
                     days: int = Query(7, ge=1, le=365)):
    """Memberships ending within the next N days, soonest first.

    Already-expired members are included when they lapsed inside the same
    window, because those are exactly the people to call today.
    """
    gym_id = user.gym_id
    today = gym_today(db, gym_id)
    cutoff = today + timedelta(days=days)

    sub = current_membership_subquery()
    rows = db.execute(
        select(Member, sub.c.end_date)
        .join(sub, sub.c.member_id == Member.id)
        .where(Member.gym_id == gym_id, Member.is_active.is_(True),
               sub.c.end_date <= cutoff, sub.c.end_date >= today - timedelta(days=30))
        .order_by(sub.c.end_date.asc())
    ).all()

    members = [r[0] for r in rows]
    balances = balances_for_members(db, [m.id for m in members])

    out = []
    for member, end_date in rows:
        current = current_membership(db, member.id)
        out.append(ExpiringMemberOut(
            member_id=member.id,
            member_code=member.member_code,
            full_name=member.full_name,
            phone=member.phone,
            whatsapp=member.whatsapp or member.phone,
            has_photo=bool(member.photo_key),
            plan_name=current.plan_name if current else None,
            end_date=end_date,
            days_remaining=(end_date - today).days,
            balance=balances.get(member.id, money(0)),
        ))
    return out


# --------------------------------------------------------------------------
# Create
# --------------------------------------------------------------------------
@router.post("", response_model=MemberCreatedOut,
             status_code=status.HTTP_201_CREATED)
def create_member(payload: MemberCreate, user: CurrentUser, db: DbSession):
    """Add Member, membership and first payment in a single request.

    One transaction, so a failure part-way through never leaves a member with a
    half-recorded payment.
    """
    from app.services.sequences import next_member_code

    gym_id = user.gym_id
    today = gym_today(db, gym_id)
    soon_days = get_gym_settings(db, gym_id).expiring_soon_days

    member = Member(
        gym_id=gym_id,
        member_code=next_member_code(db, gym_id),
        full_name=payload.full_name,
        phone=payload.phone,
        whatsapp=payload.whatsapp,
        email=payload.email,
        date_of_birth=payload.date_of_birth,
        gender=payload.gender,
        address=payload.address,
        emergency_contact_name=payload.emergency_contact_name,
        emergency_contact_phone=payload.emergency_contact_phone,
        notes=payload.notes,
        joined_on=payload.joined_on or today,
    )
    db.add(member)
    db.flush()

    membership = None
    if payload.membership:
        membership = _build_membership(db, gym_id, payload.membership, user.id,
                                       member.id)
        db.add(membership)
        db.flush()

    receipt = None
    payment = None
    if payload.payment and payload.payment.amount > 0:
        payment = record_payment(
            db,
            member=member,
            amount=payload.payment.amount,
            method=payload.payment.method,
            paid_on=payload.payment.paid_on or today,
            today=today,
            membership_id=membership.id if membership else None,
            notes=payload.payment.notes,
            user_id=user.id,
        )
        receipt = get_or_create_receipt(db, payment)

    db.commit()
    db.refresh(member)

    return MemberCreatedOut(
        member=MemberDetail(**member_detail(db, member, today, soon_days)),
        receipt_id=receipt.id if receipt else None,
        receipt_no=receipt.receipt_no if receipt else None,
        payment_id=payment.id if payment else None,
    )


# --------------------------------------------------------------------------
# Read / update / archive
# --------------------------------------------------------------------------
@router.get("/{member_id}", response_model=MemberDetail)
def get_member(member_id: int, user: CurrentUser, db: DbSession):
    gym_id = user.gym_id
    member = _get_member(db, gym_id, member_id)
    today = gym_today(db, gym_id)
    soon_days = get_gym_settings(db, gym_id).expiring_soon_days
    return member_detail(db, member, today, soon_days)


@router.put("/{member_id}", response_model=MemberDetail)
def update_member(member_id: int, payload: MemberUpdate, user: CurrentUser,
                  db: DbSession):
    gym_id = user.gym_id
    member = _get_member(db, gym_id, member_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(member, field, value)
    if not member.phone:
        raise AppError("A mobile number is required.", field="phone")

    db.commit()
    db.refresh(member)
    today = gym_today(db, gym_id)
    soon_days = get_gym_settings(db, gym_id).expiring_soon_days
    return member_detail(db, member, today, soon_days)


@router.delete("/{member_id}", response_model=MessageOut)
def archive_member(member_id: int, user: CurrentUser, db: DbSession):
    """Members are archived, never deleted - their payment history must stay."""
    member = _get_member(db, user.gym_id, member_id)
    member.is_active = False
    db.commit()
    return MessageOut(message=f"{member.full_name} has been archived.")


@router.post("/{member_id}/restore", response_model=MessageOut)
def restore_member(member_id: int, user: CurrentUser, db: DbSession):
    member = _get_member(db, user.gym_id, member_id)
    member.is_active = True
    db.commit()
    return MessageOut(message=f"{member.full_name} is active again.")


# --------------------------------------------------------------------------
# Photo
# --------------------------------------------------------------------------
@router.post("/{member_id}/photo", response_model=MessageOut)
async def upload_photo(member_id: int, user: CurrentUser, db: DbSession,
                       file: UploadFile = File(...)):
    member = _get_member(db, user.gym_id, member_id)
    data, content_type = process_photo(await file.read(), file.content_type)

    storage = get_storage()
    old_key = member.photo_key
    key = new_key(f"gym-{member.gym_id}/members")
    storage.save(key, data, content_type)

    member.photo_key = key
    db.commit()
    if old_key:
        storage.delete(old_key)
    return MessageOut(message="Photo saved.")


@router.get("/{member_id}/photo")
def get_photo(member_id: int, user: CurrentUser, db: DbSession):
    """Photos are served only to signed-in staff, never from a public URL."""
    member = _get_member(db, user.gym_id, member_id)
    if not member.photo_key:
        raise NotFound("photo")
    data = get_storage().load(member.photo_key)
    return Response(
        content=data,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.delete("/{member_id}/photo", response_model=MessageOut)
def delete_photo(member_id: int, user: CurrentUser, db: DbSession):
    member = _get_member(db, user.gym_id, member_id)
    if member.photo_key:
        get_storage().delete(member.photo_key)
        member.photo_key = None
        db.commit()
    return MessageOut(message="Photo removed.")


# --------------------------------------------------------------------------
# History
# --------------------------------------------------------------------------
@router.get("/{member_id}/payments", response_model=list[PaymentOut])
def member_payments(member_id: int, user: CurrentUser, db: DbSession):
    member = _get_member(db, user.gym_id, member_id)
    payments = db.scalars(
        select(Payment)
        .where(Payment.member_id == member.id)
        .order_by(Payment.paid_on.desc(), Payment.id.desc())
    )
    return [payment_out(db, p) for p in payments]


@router.get("/{member_id}/memberships", response_model=list[MembershipOut])
def member_memberships(member_id: int, user: CurrentUser, db: DbSession):
    member = _get_member(db, user.gym_id, member_id)
    today = gym_today(db, user.gym_id)
    rows = db.scalars(
        select(Membership)
        .where(Membership.member_id == member.id)
        .order_by(Membership.start_date.desc(), Membership.id.desc())
    )
    return [membership_out(db, m, today) for m in rows]


@router.get("/{member_id}/attendance", response_model=list[AttendanceOut])
def member_attendance(member_id: int, user: CurrentUser, db: DbSession,
                      limit: int = Query(60, ge=1, le=365)):
    from app.models import Attendance

    member = _get_member(db, user.gym_id, member_id)
    rows = db.scalars(
        select(Attendance)
        .where(Attendance.member_id == member.id)
        .order_by(Attendance.attend_date.desc())
        .limit(limit)
    )
    return [
        AttendanceOut(
            id=a.id, member_id=a.member_id, member_name=member.full_name,
            member_code=member.member_code, attend_date=a.attend_date,
            check_in_at=a.check_in_at,
        )
        for a in rows
    ]


# --------------------------------------------------------------------------
# Renewal
# --------------------------------------------------------------------------
@router.get("/{member_id}/renewal-defaults")
def renewal_defaults(member_id: int, user: CurrentUser, db: DbSession):
    """Pre-fills the renewal form so the owner only has to confirm."""
    gym_id = user.gym_id
    member = _get_member(db, gym_id, member_id)
    today = gym_today(db, gym_id)
    current = current_membership(db, member.id)
    return {
        "start_date": next_start_date(current.end_date if current else None, today),
        "plan_id": current.plan_id if current else None,
        "plan_name": current.plan_name if current else None,
    }


@router.post("/{member_id}/renew", response_model=MemberCreatedOut,
             status_code=status.HTTP_201_CREATED)
def renew_membership(member_id: int, payload: RenewIn, user: CurrentUser,
                     db: DbSession):
    """Start a new term. The previous one stays in history untouched."""
    gym_id = user.gym_id
    member = _get_member(db, gym_id, member_id)
    today = gym_today(db, gym_id)
    soon_days = get_gym_settings(db, gym_id).expiring_soon_days

    membership = _build_membership(db, gym_id, payload.membership, user.id,
                                   member.id)
    db.add(membership)
    db.flush()

    receipt = None
    payment = None
    if payload.payment and payload.payment.amount > 0:
        payment = record_payment(
            db,
            member=member,
            amount=payload.payment.amount,
            method=payload.payment.method,
            paid_on=payload.payment.paid_on or today,
            today=today,
            membership_id=membership.id,
            notes=payload.payment.notes,
            user_id=user.id,
        )
        receipt = get_or_create_receipt(db, payment)

    if not member.is_active:
        member.is_active = True

    db.commit()
    db.refresh(member)

    return MemberCreatedOut(
        member=MemberDetail(**member_detail(db, member, today, soon_days)),
        receipt_id=receipt.id if receipt else None,
        receipt_no=receipt.receipt_no if receipt else None,
        payment_id=payment.id if payment else None,
    )


@router.post("/{member_id}/memberships", response_model=MembershipOut,
             status_code=status.HTTP_201_CREATED)
def add_membership(member_id: int, payload: MembershipIn, user: CurrentUser,
                   db: DbSession):
    """Attach a membership to a member who was added without one."""
    gym_id = user.gym_id
    member = _get_member(db, gym_id, member_id)
    membership = _build_membership(db, gym_id, payload, user.id, member.id)
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return membership_out(db, membership, gym_today(db, gym_id))
