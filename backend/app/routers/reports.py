"""Reports, CSV export and the full backup archive."""
from calendar import monthrange
from datetime import date, timedelta

from fastapi import APIRouter, Query, Response
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession, get_gym_settings, gym_today
from app.errors import AppError
from app.models import Attendance, Expense, Member, Membership, Payment
from app.schemas.messaging import RevenuePoint, RevenueSeriesOut
from app.schemas.misc import MonthlySummaryOut
from app.services.exports import DATASETS, build_backup_zip, to_csv
from app.services.membership import current_membership_subquery
from app.services.money import add, money, money_str, subtract
from app.services.presenters import balances_for_members
from app.services.salary import gym_salary_paid_in_range

router = APIRouter(prefix="/reports", tags=["reports"])


def _month_bounds(month: str | None, today: date) -> tuple[date, date]:
    """'2026-09' -> (1 Sep 2026, 30 Sep 2026)."""
    if not month:
        first = today.replace(day=1)
    else:
        try:
            year, mon = month.split("-")
            first = date(int(year), int(mon), 1)
        except (ValueError, TypeError) as exc:
            raise AppError("Please choose a valid month.", field="month") from exc
    last = first.replace(day=monthrange(first.year, first.month)[1])
    return first, last


@router.get("/monthly-summary", response_model=MonthlySummaryOut)
def monthly_summary(user: CurrentUser, db: DbSession,
                    month: str | None = Query(None, description="YYYY-MM")):
    """One month on one screen: members, money in, money out, attendance."""
    gym_id = user.gym_id
    today = gym_today(db, gym_id)
    start, end = _month_bounds(month, today)
    # A month in progress is only counted up to today.
    effective_end = min(end, today) if end > today else end

    total_members = db.scalar(
        select(func.count(Member.id)).where(Member.gym_id == gym_id,
                                            Member.is_active.is_(True))
    ) or 0
    new_members = db.scalar(
        select(func.count(Member.id)).where(
            Member.gym_id == gym_id, Member.joined_on >= start,
            Member.joined_on <= end,
        )
    ) or 0

    # A renewal is a membership sold in the month to someone who already had one.
    memberships_sold = list(
        db.execute(
            select(Membership.member_id, Membership.id)
            .where(Membership.gym_id == gym_id, Membership.start_date >= start,
                   Membership.start_date <= end)
        ).all()
    )
    renewals = 0
    for member_id, membership_id in memberships_sold:
        earlier = db.scalar(
            select(func.count(Membership.id)).where(
                Membership.member_id == member_id, Membership.id < membership_id
            )
        ) or 0
        if earlier:
            renewals += 1

    sub = current_membership_subquery()
    rows = db.execute(
        select(Member.id, sub.c.end_date)
        .outerjoin(sub, sub.c.member_id == Member.id)
        .where(Member.gym_id == gym_id, Member.is_active.is_(True))
    ).all()
    active = sum(1 for _, e in rows if e and e >= end)
    expired = sum(1 for _, e in rows if e and e < end)

    revenue = money(db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.gym_id == gym_id, Payment.voided_at.is_(None),
            Payment.paid_on >= start, Payment.paid_on <= end,
        )
    ) or 0)
    expenses = money(db.scalar(
        select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.gym_id == gym_id, Expense.expense_date >= start,
            Expense.expense_date <= end,
        )
    ) or 0)
    salary_paid = gym_salary_paid_in_range(db, gym_id, start, end)

    balances = balances_for_members(db, [r[0] for r in rows])
    pending = money(sum(balances.values(), money(0)))

    attendance_count = db.scalar(
        select(func.count(Attendance.id)).where(
            Attendance.gym_id == gym_id, Attendance.attend_date >= start,
            Attendance.attend_date <= end,
        )
    ) or 0

    return MonthlySummaryOut(
        month=start.strftime("%B %Y"),
        period_start=start,
        period_end=effective_end,
        total_members=total_members,
        new_members=new_members,
        renewals=renewals,
        active_members=active,
        expired_members=expired,
        total_revenue=revenue,
        total_expenses=expenses,
        staff_salary_paid=salary_paid,
        pending_payments=pending,
        attendance_count=attendance_count,
        net_amount=subtract(revenue, expenses),
    )


@router.get("/collections")
def collections(user: CurrentUser, db: DbSession,
                start: date | None = None, end: date | None = None):
    """Payment report: totals, and a breakdown by how the money came in."""
    gym_id = user.gym_id
    today = gym_today(db, gym_id)
    start = start or today.replace(day=1)
    end = end or today

    rows = db.execute(
        select(Payment.method, func.count(Payment.id),
               func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.gym_id == gym_id, Payment.voided_at.is_(None),
               Payment.paid_on >= start, Payment.paid_on <= end)
        .group_by(Payment.method)
        .order_by(func.sum(Payment.amount).desc())
    ).all()

    total = add(*[a for _, _, a in rows]) if rows else money(0)
    return {
        "start": start,
        "end": end,
        "total": money_str(total),
        "count": sum(c for _, c, _ in rows),
        "by_method": [
            {"method": m, "count": c, "amount": money_str(a)} for m, c, a in rows
        ],
    }


@router.get("/attendance-summary")
def attendance_summary(user: CurrentUser, db: DbSession,
                       start: date | None = None, end: date | None = None):
    """Attendance report: visits per day plus the busiest members."""
    gym_id = user.gym_id
    today = gym_today(db, gym_id)
    start = start or today.replace(day=1)
    end = end or today

    per_day = db.execute(
        select(Attendance.attend_date, func.count(Attendance.id))
        .where(Attendance.gym_id == gym_id, Attendance.attend_date >= start,
               Attendance.attend_date <= end)
        .group_by(Attendance.attend_date)
        .order_by(Attendance.attend_date)
    ).all()

    top = db.execute(
        select(Member.full_name, Member.member_code, func.count(Attendance.id))
        .join(Member, Member.id == Attendance.member_id)
        .where(Attendance.gym_id == gym_id, Attendance.attend_date >= start,
               Attendance.attend_date <= end)
        .group_by(Member.id, Member.full_name, Member.member_code)
        .order_by(func.count(Attendance.id).desc())
        .limit(10)
    ).all()

    total = sum(c for _, c in per_day)
    days = max(1, (end - start).days + 1)
    return {
        "start": start,
        "end": end,
        "total_visits": total,
        "average_per_day": round(total / days, 1),
        "per_day": [{"date": d, "count": c} for d, c in per_day],
        "top_members": [
            {"name": n, "member_code": code, "visits": c} for n, code, c in top
        ],
    }


@router.get("/export/{dataset}.csv")
def export_csv(dataset: str, user: CurrentUser, db: DbSession,
               start: date | None = None, end: date | None = None,
               days: int = Query(30, ge=1, le=365)):
    """Any report as a spreadsheet the owner can open in Excel."""
    if dataset not in DATASETS:
        raise AppError("That report is not available.", 404)

    gym_id = user.gym_id
    today = gym_today(db, gym_id)
    filename, header, rows = DATASETS[dataset](
        db, gym_id, today, start=start, end=end, days=days
    )
    return Response(
        content=to_csv(header, rows),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/backup.zip")
def download_backup(user: CurrentUser, db: DbSession):
    """One file containing every record in the system, as CSVs.

    The owner should download this monthly and keep it somewhere safe.
    """
    gym_id = user.gym_id
    today = gym_today(db, gym_id)
    settings_row = get_gym_settings(db, gym_id)
    data = build_backup_zip(db, gym_id, today)
    stamp = today.strftime("%Y-%m-%d")
    name = f"gym-backup-{stamp}.zip"
    return Response(
        content=data,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "X-Backup-Timezone": settings_row.timezone,
        },
    )


# --------------------------------------------------------------------------
# Revenue series
#
# Feeds the dashboard chart. Bucketing happens in Python rather than in SQL
# on purpose: date_trunc and strftime differ between PostgreSQL and SQLite,
# and the whole schema is deliberately portable between the two. The row
# counts here are a single gym's payments, so this is cheap.
# --------------------------------------------------------------------------
@router.get("/revenue-series", response_model=RevenueSeriesOut)
def revenue_series(user: CurrentUser, db: DbSession,
                   period: str = Query("daily", pattern="^(daily|weekly|monthly)$")):
    gym_id = user.gym_id
    today = gym_today(db, gym_id)

    # Enough history to make the shape meaningful, without a huge payload.
    if period == "daily":
        start = today - timedelta(days=29)
    elif period == "weekly":
        start = today - timedelta(weeks=11)
        start -= timedelta(days=start.weekday())      # back to a Monday
    else:
        start = (today.replace(day=1) - timedelta(days=334)).replace(day=1)

    def bucket(value: date) -> date:
        if period == "daily":
            return value
        if period == "weekly":
            return value - timedelta(days=value.weekday())
        return value.replace(day=1)

    def label(value: date) -> str:
        if period == "daily":
            return f"{value.day} {value.strftime('%b')}"
        if period == "weekly":
            return f"{value.day} {value.strftime('%b')}"
        return f"{value.strftime('%b')} {str(value.year)[2:]}"

    income: dict[date, object] = {}
    expense: dict[date, object] = {}

    for paid_on, amount in db.execute(
        select(Payment.paid_on, Payment.amount).where(
            Payment.gym_id == gym_id, Payment.voided_at.is_(None),
            Payment.paid_on >= start, Payment.paid_on <= today,
        )
    ).all():
        key = bucket(paid_on)
        income[key] = add(income.get(key, money(0)), money(amount))

    for spent_on, amount in db.execute(
        select(Expense.expense_date, Expense.amount).where(
            Expense.gym_id == gym_id,
            Expense.expense_date >= start, Expense.expense_date <= today,
        )
    ).all():
        key = bucket(spent_on)
        expense[key] = add(expense.get(key, money(0)), money(amount))

    # Every bucket appears, including the empty ones - a chart with gaps
    # silently misrepresents a quiet week as a missing one.
    points = []
    cursor = bucket(start)
    while cursor <= today:
        got_in = income.get(cursor, money(0))
        got_out = expense.get(cursor, money(0))
        points.append(RevenuePoint(
            date=cursor, label=label(cursor),
            income=got_in, expense=got_out, net=subtract(got_in, got_out),
        ))
        if period == "daily":
            cursor += timedelta(days=1)
        elif period == "weekly":
            cursor += timedelta(weeks=1)
        else:
            cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)

    total_in = add(*[p.income for p in points]) if points else money(0)
    total_out = add(*[p.expense for p in points]) if points else money(0)
    return RevenueSeriesOut(
        period=period, start=start, end=today,
        total_income=total_in, total_expense=total_out,
        total_net=subtract(total_in, total_out),
        points=points,
    )
