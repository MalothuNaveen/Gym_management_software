"""Staff records and the salary / advance ledger."""
from datetime import date

from fastapi import APIRouter, File, Query, Response, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.deps import CurrentUser, DbSession, gym_today
from app.errors import NotFound
from app.models import Staff, StaffSalaryRecord
from app.schemas.common import MessageOut
from app.schemas.staff import (
    SalaryRecordIn, SalaryRecordOut, SalarySummaryOut, StaffDetail, StaffIn,
    StaffOut, StaffUpdate,
)
from app.services.images import process_photo
from app.services.presenters import staff_out
from app.services.salary import month_start, salary_summary
from app.services.storage import get_storage, new_key

router = APIRouter(prefix="/staff", tags=["staff"])


def _get_staff(db: Session, gym_id: int, staff_id: int) -> Staff:
    member = db.get(Staff, staff_id)
    if not member or member.gym_id != gym_id:
        raise NotFound("staff member")
    return member


@router.get("", response_model=list[StaffOut])
def list_staff(user: CurrentUser, db: DbSession, q: str | None = None,
               include_inactive: bool = True, month: date | None = None):
    gym_id = user.gym_id
    period = month_start(month or gym_today(db, gym_id))

    stmt = select(Staff).where(Staff.gym_id == gym_id)
    if not include_inactive:
        stmt = stmt.where(Staff.status == "active")
    if q:
        term = f"%{q.strip().lower()}%"
        digits = "".join(c for c in q if c.isdigit())
        conditions = [func.lower(Staff.full_name).like(term)]
        if digits:
            conditions.append(Staff.phone.like(f"%{digits}%"))
        stmt = stmt.where(or_(*conditions))

    rows = db.scalars(stmt.order_by(Staff.status, Staff.full_name))
    return [staff_out(db, s, period) for s in rows]


@router.post("", response_model=StaffOut, status_code=status.HTTP_201_CREATED)
def create_staff(payload: StaffIn, user: CurrentUser, db: DbSession):
    member = Staff(gym_id=user.gym_id, **payload.model_dump())
    db.add(member)
    db.commit()
    db.refresh(member)
    return staff_out(db, member, month_start(gym_today(db, user.gym_id)))


@router.get("/{staff_id}", response_model=StaffDetail)
def get_staff(staff_id: int, user: CurrentUser, db: DbSession,
              month: date | None = None):
    gym_id = user.gym_id
    member = _get_staff(db, gym_id, staff_id)
    period = month_start(month or gym_today(db, gym_id))
    return staff_out(db, member, period, include_records=True)


@router.put("/{staff_id}", response_model=StaffOut)
def update_staff(staff_id: int, payload: StaffUpdate, user: CurrentUser,
                 db: DbSession):
    member = _get_staff(db, user.gym_id, staff_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(member, field, value)
    db.commit()
    db.refresh(member)
    return staff_out(db, member, month_start(gym_today(db, user.gym_id)))


@router.delete("/{staff_id}", response_model=MessageOut)
def deactivate_staff(staff_id: int, user: CurrentUser, db: DbSession):
    """Staff are deactivated, not deleted - their salary history must remain."""
    member = _get_staff(db, user.gym_id, staff_id)
    member.status = "inactive"
    db.commit()
    return MessageOut(message=f"{member.full_name} is now marked inactive.")


# --- Photo ----------------------------------------------------------------

@router.post("/{staff_id}/photo", response_model=MessageOut)
async def upload_staff_photo(staff_id: int, user: CurrentUser, db: DbSession,
                             file: UploadFile = File(...)):
    member = _get_staff(db, user.gym_id, staff_id)
    data, content_type = process_photo(await file.read(), file.content_type)

    storage = get_storage()
    old_key = member.photo_key
    key = new_key(f"gym-{member.gym_id}/staff")
    storage.save(key, data, content_type)
    member.photo_key = key
    db.commit()
    if old_key:
        storage.delete(old_key)
    return MessageOut(message="Photo saved.")


@router.get("/{staff_id}/photo")
def get_staff_photo(staff_id: int, user: CurrentUser, db: DbSession):
    member = _get_staff(db, user.gym_id, staff_id)
    if not member.photo_key:
        raise NotFound("photo")
    return Response(content=get_storage().load(member.photo_key),
                    media_type="image/jpeg",
                    headers={"Cache-Control": "private, max-age=3600"})


# --- Salary ---------------------------------------------------------------

@router.get("/{staff_id}/salary", response_model=SalarySummaryOut)
def get_salary_summary(staff_id: int, user: CurrentUser, db: DbSession,
                       month: date | None = None):
    gym_id = user.gym_id
    member = _get_staff(db, gym_id, staff_id)
    return salary_summary(db, member, month or gym_today(db, gym_id))


@router.get("/{staff_id}/salary/history", response_model=list[SalaryRecordOut])
def salary_history(staff_id: int, user: CurrentUser, db: DbSession,
                   limit: int = Query(100, ge=1, le=500)):
    member = _get_staff(db, user.gym_id, staff_id)
    rows = db.scalars(
        select(StaffSalaryRecord)
        .where(StaffSalaryRecord.staff_id == member.id)
        .order_by(StaffSalaryRecord.paid_on.desc(), StaffSalaryRecord.id.desc())
        .limit(limit)
    )
    return [
        SalaryRecordOut(
            id=r.id, staff_id=r.staff_id, staff_name=member.full_name,
            period_month=r.period_month, kind=r.kind, amount=r.amount,
            paid_on=r.paid_on, method=r.method, notes=r.notes,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/salary", response_model=SalaryRecordOut,
             status_code=status.HTTP_201_CREATED)
def add_salary_record(payload: SalaryRecordIn, user: CurrentUser, db: DbSession):
    """Add a salary payment, an advance, or another payout."""
    gym_id = user.gym_id
    today = gym_today(db, gym_id)
    member = _get_staff(db, gym_id, payload.staff_id)

    record = StaffSalaryRecord(
        gym_id=gym_id,
        staff_id=member.id,
        period_month=month_start(payload.period_month or payload.paid_on or today),
        kind=payload.kind,
        amount=payload.amount,
        paid_on=payload.paid_on or today,
        method=payload.method,
        notes=payload.notes,
        created_by_user_id=user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return SalaryRecordOut(
        id=record.id, staff_id=record.staff_id, staff_name=member.full_name,
        period_month=record.period_month, kind=record.kind, amount=record.amount,
        paid_on=record.paid_on, method=record.method, notes=record.notes,
        created_at=record.created_at,
    )
