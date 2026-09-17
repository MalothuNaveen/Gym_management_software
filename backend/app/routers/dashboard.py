"""The one screen that answers: what is happening at my gym right now?"""
from datetime import timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession, get_gym, get_gym_settings, gym_today
from app.models import Attendance, Expense, Member, Membership, Payment
from app.schemas.misc import (
    DashboardAttendance, DashboardMembers, DashboardMoney, DashboardOut,
)
from app.services.membership import current_membership_subquery
from app.services.money import money, subtract
from app.services.presenters import balances_for_members

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(user: CurrentUser, db: DbSession):
    gym_id = user.gym_id
    gym = get_gym(db, gym_id)
    today = gym_today(db, gym_id)
    soon_days = get_gym_settings(db, gym_id).expiring_soon_days
    month_start = today.replace(day=1)
    soon_cutoff = today + timedelta(days=soon_days)

    # --- Members -----------------------------------------------------------
    sub = current_membership_subquery()
    rows = db.execute(
        select(Member.id, sub.c.end_date)
        .outerjoin(sub, sub.c.member_id == Member.id)
        .where(Member.gym_id == gym_id, Member.is_active.is_(True))
    ).all()

    total = len(rows)
    active = expiring = expired = no_membership = 0
    for _, end_date in rows:
        if end_date is None:
            no_membership += 1
        elif end_date < today:
            expired += 1
        elif end_date <= soon_cutoff:
            expiring += 1
            active += 1          # expiring members are still active today
        else:
            active += 1

    # --- Money -------------------------------------------------------------
    def collected(start, end):
        return money(db.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.gym_id == gym_id, Payment.voided_at.is_(None),
                Payment.paid_on >= start, Payment.paid_on <= end,
            )
        ) or 0)

    today_collection = collected(today, today)
    month_collection = collected(month_start, today)

    month_expenses = money(db.scalar(
        select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.gym_id == gym_id, Expense.expense_date >= month_start,
            Expense.expense_date <= today,
        )
    ) or 0)

    # Pending = the sum of every member who still owes something.
    all_ids = [r[0] for r in rows]
    balances = balances_for_members(db, all_ids)
    pending = money(sum(balances.values(), money(0)))

    # --- Attendance --------------------------------------------------------
    today_attendance = db.scalar(
        select(func.count(Attendance.id)).where(
            Attendance.gym_id == gym_id, Attendance.attend_date == today
        )
    ) or 0

    # --- Expiring list -----------------------------------------------------
    from app.routers.members import expiring_members
    expiring_list = expiring_members(user, db, days=soon_days)

    return DashboardOut(
        gym_name=gym.name,
        today=today,
        members=DashboardMembers(
            total=total, active=active, expiring_soon=expiring,
            expired=expired, no_membership=no_membership,
        ),
        money=DashboardMoney(
            today_collection=today_collection,
            month_collection=month_collection,
            pending_payments=pending,
            month_expenses=month_expenses,
            month_net=subtract(month_collection, month_expenses),
        ),
        attendance=DashboardAttendance(
            today_count=today_attendance, active_members=active,
        ),
        expiring=expiring_list[:10],
    )
