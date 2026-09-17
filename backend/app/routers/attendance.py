"""Attendance: search a member, tap Check In, done."""
from datetime import date, timedelta

from fastapi import APIRouter, Query, status
from sqlalchemy import func, or_, select

from app.deps import CurrentUser, DbSession, get_gym_settings, gym_now, gym_today
from app.errors import AppError, NotFound
from app.models import Attendance, Member, User
from app.models.enums import MemberStatus
from app.schemas.common import MessageOut
from app.schemas.misc import AttendanceOut, AttendanceRosterItem, CheckInIn
from app.services.membership import current_membership_subquery

router = APIRouter(prefix="/attendance", tags=["attendance"])

RANGE_LABELS = ("today", "yesterday", "week", "month", "custom")


def _range_bounds(period: str, today: date, start: date | None,
                  end: date | None) -> tuple[date, date]:
    if period == "today":
        return today, today
    if period == "yesterday":
        y = today - timedelta(days=1)
        return y, y
    if period == "week":            # Monday to today
        return today - timedelta(days=today.weekday()), today
    if period == "month":
        return today.replace(day=1), today
    return start or today, end or today


@router.post("/check-in", response_model=AttendanceOut,
             status_code=status.HTTP_201_CREATED)
def check_in(payload: CheckInIn, user: CurrentUser, db: DbSession):
    """Mark a member present. Tapping twice in a day is rejected, not doubled."""
    gym_id = user.gym_id
    today = gym_today(db, gym_id)
    when = payload.attend_date or today

    if when > today:
        raise AppError("You cannot mark attendance for a future date.")

    member = db.get(Member, payload.member_id)
    if not member or member.gym_id != gym_id:
        raise NotFound("member")
    if not member.is_active:
        raise AppError(f"{member.full_name} is archived. Restore the member first.")

    existing = db.scalar(
        select(Attendance).where(
            Attendance.member_id == member.id, Attendance.attend_date == when
        )
    )
    if existing:
        raise AppError(f"{member.full_name} is already marked present.",
                       status.HTTP_409_CONFLICT)

    record = Attendance(
        gym_id=gym_id,
        member_id=member.id,
        attend_date=when,
        check_in_at=gym_now(db, gym_id),
        marked_by_user_id=user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return AttendanceOut(
        id=record.id, member_id=member.id, member_name=member.full_name,
        member_code=member.member_code, attend_date=record.attend_date,
        check_in_at=record.check_in_at, marked_by=user.full_name,
    )


@router.delete("/{attendance_id}", response_model=MessageOut)
def undo_check_in(attendance_id: int, user: CurrentUser, db: DbSession):
    """Undo a check-in marked by mistake (attendance is not a financial record)."""
    record = db.get(Attendance, attendance_id)
    if not record or record.gym_id != user.gym_id:
        raise NotFound("attendance record")
    db.delete(record)
    db.commit()
    return MessageOut(message="Check-in removed.")


@router.get("", response_model=list[AttendanceOut])
def list_attendance(
    user: CurrentUser,
    db: DbSession,
    period: str = Query("today", pattern="^(today|yesterday|week|month|custom)$"),
    start: date | None = None,
    end: date | None = None,
    q: str | None = None,
):
    gym_id = user.gym_id
    today = gym_today(db, gym_id)
    from_date, to_date = _range_bounds(period, today, start, end)

    stmt = (
        select(Attendance, Member, User.full_name)
        .join(Member, Member.id == Attendance.member_id)
        .outerjoin(User, User.id == Attendance.marked_by_user_id)
        .where(Attendance.gym_id == gym_id,
               Attendance.attend_date >= from_date,
               Attendance.attend_date <= to_date)
    )
    if q:
        term = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(Member.full_name).like(term),
                              func.lower(Member.member_code).like(term)))

    rows = db.execute(
        stmt.order_by(Attendance.attend_date.desc(), Attendance.check_in_at.desc())
    ).all()

    return [
        AttendanceOut(
            id=a.id, member_id=m.id, member_name=m.full_name,
            member_code=m.member_code, attend_date=a.attend_date,
            check_in_at=a.check_in_at, marked_by=marked_by,
        )
        for a, m, marked_by in rows
    ]


@router.get("/roster", response_model=list[AttendanceRosterItem])
def roster(user: CurrentUser, db: DbSession, on: date | None = None,
           q: str | None = None, only_absent: bool = False):
    """Every active member for a day, with who is already checked in.

    This is what the attendance screen renders: search, then one tap.
    """
    gym_id = user.gym_id
    today = gym_today(db, gym_id)
    when = on or today
    soon_days = get_gym_settings(db, gym_id).expiring_soon_days

    present = {
        a.member_id: a
        for a in db.scalars(
            select(Attendance).where(Attendance.gym_id == gym_id,
                                     Attendance.attend_date == when)
        )
    }

    sub = current_membership_subquery()
    stmt = (
        select(Member, sub.c.end_date)
        .outerjoin(sub, sub.c.member_id == Member.id)
        .where(Member.gym_id == gym_id, Member.is_active.is_(True))
    )
    if q:
        term = f"%{q.strip().lower()}%"
        digits = "".join(c for c in q if c.isdigit())
        conditions = [func.lower(Member.full_name).like(term),
                      func.lower(Member.member_code).like(term)]
        if digits:
            conditions.append(Member.phone.like(f"%{digits}%"))
        stmt = stmt.where(or_(*conditions))

    rows = db.execute(stmt.order_by(Member.full_name)).all()

    items: list[AttendanceRosterItem] = []
    for member, end_date in rows:
        record = present.get(member.id)
        if only_absent and record:
            continue
        if end_date is None:
            state = MemberStatus.NO_MEMBERSHIP.value
        elif end_date < when:
            state = MemberStatus.EXPIRED.value
        elif end_date <= when + timedelta(days=soon_days):
            state = MemberStatus.EXPIRING_SOON.value
        else:
            state = MemberStatus.ACTIVE.value

        items.append(AttendanceRosterItem(
            member_id=member.id, member_code=member.member_code,
            full_name=member.full_name, phone=member.phone,
            has_photo=bool(member.photo_key), status=state,
            present=record is not None,
            check_in_at=record.check_in_at if record else None,
            attendance_id=record.id if record else None,
        ))

    # Checked-in members first so the owner sees today's activity at a glance.
    items.sort(key=lambda i: (not i.present, i.full_name.lower()))
    return items
