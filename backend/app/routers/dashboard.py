"""The one screen that answers: what is happening at my gym right now?"""
from datetime import timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession, get_gym, get_gym_settings, gym_today
from app.models import Attendance, Expense, Member, Membership, Payment
from app.schemas.misc import (
    DashboardAttendance, DashboardMembers, DashboardMoney, DashboardOut,
    DashboardPaymentStatus, RecentMemberOut,
)
from app.services.membership import current_membership, current_membership_subquery
from app.services.money import add, money, subtract
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

    # The headline count above includes anyone who walked in today, lapsed
    # members included - which is correct, and is why it can exceed the number
    # of active members. The percentage needs a figure that cannot, so it is
    # measured against active members only.
    active_ids = {mid for mid, end_date in rows
                  if end_date is not None and end_date >= today}
    present_ids = set(db.scalars(
        select(Attendance.member_id).where(
            Attendance.gym_id == gym_id, Attendance.attend_date == today
        )
    )) if active_ids else set()
    active_present = len(active_ids & present_ids)
    percent = round(active_present / len(active_ids) * 100) if active_ids else 0

    # --- Payment status ----------------------------------------------------
    # Grouped by where each member stands, because "who owes me money" is the
    # question, not "how did the money arrive".
    end_dates = {mid: end for mid, end in rows}
    status_counts = {"paid": 0, "pending": 0, "overdue": 0}
    status_totals = {"paid": money(0), "pending": money(0), "overdue": money(0)}
    for member_id in all_ids:
        owed = balances.get(member_id, money(0))
        if owed <= 0:
            status_counts["paid"] += 1
            continue
        end_date = end_dates.get(member_id)
        # Still owing after the membership has lapsed is a different problem
        # from still owing part-way through a term.
        key = "overdue" if (end_date is not None and end_date < today) else "pending"
        status_counts[key] += 1
        status_totals[key] = add(status_totals[key], owed)

    # --- Recent members ----------------------------------------------------
    recent_rows = list(db.scalars(
        select(Member)
        .where(Member.gym_id == gym_id, Member.is_active.is_(True))
        .order_by(Member.created_at.desc(), Member.id.desc())
        .limit(6)
    ))
    recent = []
    for member in recent_rows:
        current = current_membership(db, member.id)
        end_date = current.end_date if current else None
        if end_date is None:
            member_status = "no_membership"
            days_left = None
        else:
            days_left = (end_date - today).days
            if end_date < today:
                member_status = "expired"
            elif end_date <= soon_cutoff:
                member_status = "expiring_soon"
            else:
                member_status = "active"
        recent.append(RecentMemberOut(
            member_id=member.id,
            member_code=member.member_code,
            full_name=member.full_name,
            phone=member.phone,
            has_photo=bool(member.photo_key),
            joined_on=member.joined_on,
            plan_name=current.plan_name if current else None,
            status=member_status,
            end_date=end_date,
            days_remaining=days_left,
        ))

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
            today_count=today_attendance,
            active_members=active,
            not_checked_in=max(0, len(active_ids) - active_present),
            percent=percent,
        ),
        expiring=expiring_list[:10],
        payment_status=DashboardPaymentStatus(
            paid_count=status_counts["paid"],
            pending_count=status_counts["pending"],
            overdue_count=status_counts["overdue"],
            paid_amount=money(0),
            pending_amount=status_totals["pending"],
            overdue_amount=status_totals["overdue"],
        ),
        recent_members=recent,
    )
