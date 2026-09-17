"""Membership plans. Deactivated, never deleted, once anything depends on them."""
from fastapi import APIRouter, status
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession
from app.errors import AppError, NotFound
from app.models import Membership, MembershipPlan
from app.schemas.common import MessageOut
from app.schemas.member import PlanIn, PlanOut, PlanUpdate

router = APIRouter(prefix="/plans", tags=["plans"])


def _usage(db: DbSession, plan_id: int) -> int:
    return db.scalar(
        select(func.count(Membership.id)).where(Membership.plan_id == plan_id)
    ) or 0


@router.get("", response_model=list[PlanOut])
def list_plans(user: CurrentUser, db: DbSession, include_inactive: bool = True):
    stmt = select(MembershipPlan).where(MembershipPlan.gym_id == user.gym_id)
    if not include_inactive:
        stmt = stmt.where(MembershipPlan.is_active.is_(True))
    plans = list(
        db.scalars(stmt.order_by(MembershipPlan.sort_order,
                                 MembershipPlan.duration_days))
    )
    return [
        PlanOut(**{**PlanOut.model_validate(p).model_dump(),
                   "members_using": _usage(db, p.id)})
        for p in plans
    ]


@router.post("", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
def create_plan(payload: PlanIn, user: CurrentUser, db: DbSession):
    plan = MembershipPlan(gym_id=user.gym_id, **payload.model_dump())
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.put("/{plan_id}", response_model=PlanOut)
def update_plan(plan_id: int, payload: PlanUpdate, user: CurrentUser,
                db: DbSession):
    """Editing a plan never rewrites history - existing memberships keep the
    name and price they were sold at."""
    plan = db.get(MembershipPlan, plan_id)
    if not plan or plan.gym_id != user.gym_id:
        raise NotFound("plan")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(plan, field, value)
    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/{plan_id}", response_model=MessageOut)
def deactivate_plan(plan_id: int, user: CurrentUser, db: DbSession):
    """Hides the plan from new sales. Deleted outright only if never used."""
    plan = db.get(MembershipPlan, plan_id)
    if not plan or plan.gym_id != user.gym_id:
        raise NotFound("plan")

    used = _usage(db, plan.id)
    if used:
        if not plan.is_active:
            raise AppError("That plan is already deactivated.")
        plan.is_active = False
        db.commit()
        return MessageOut(
            message=f"'{plan.name}' is no longer offered. "
                    f"{used} past membership(s) still reference it."
        )

    db.delete(plan)
    db.commit()
    return MessageOut(message=f"'{plan.name}' was removed.")


@router.post("/{plan_id}/activate", response_model=PlanOut)
def activate_plan(plan_id: int, user: CurrentUser, db: DbSession):
    plan = db.get(MembershipPlan, plan_id)
    if not plan or plan.gym_id != user.gym_id:
        raise NotFound("plan")
    plan.is_active = True
    db.commit()
    db.refresh(plan)
    return plan
