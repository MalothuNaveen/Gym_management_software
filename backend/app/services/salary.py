"""Staff salary arithmetic.

Deliberately not a payroll system. For any calendar month the owner needs four
numbers, and this module is the one place they are calculated:

    Salary for the month   = staff.monthly_salary
    Paid this month        = sum of 'salary' records for that month
    Advance this month     = sum of 'advance' records for that month
    Remaining              = salary - paid - advance

Worked example from the spec:
    15,000 salary - 10,000 paid - 2,000 advance = 3,000 remaining
"""
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Staff, StaffSalaryRecord
from app.models.enums import SalaryRecordKind
from app.services.money import money, subtract


def month_start(value: date) -> date:
    """Normalise any date to the first of its month - how periods are stored."""
    return value.replace(day=1)


def _sum_for(db: Session, staff_id: int, period: date, kind: str) -> Decimal:
    total = db.scalar(
        select(func.coalesce(func.sum(StaffSalaryRecord.amount), 0)).where(
            StaffSalaryRecord.staff_id == staff_id,
            StaffSalaryRecord.period_month == period,
            StaffSalaryRecord.kind == kind,
        )
    ) or 0
    return money(total)


def salary_summary(db: Session, staff: Staff, period: date) -> dict:
    """The month's salary picture for one staff member."""
    period = month_start(period)
    salary_due = money(staff.monthly_salary)
    paid = _sum_for(db, staff.id, period, SalaryRecordKind.SALARY.value)
    advance = _sum_for(db, staff.id, period, SalaryRecordKind.ADVANCE.value)
    other = _sum_for(db, staff.id, period, SalaryRecordKind.OTHER.value)

    remaining = subtract(subtract(salary_due, paid), advance)
    return {
        "period_month": period,
        "monthly_salary": salary_due,
        "paid": paid,
        "advance": advance,
        "other": other,
        # Negative remaining means the staff member has been overpaid this
        # month; we show it as-is rather than hiding it.
        "remaining": remaining,
        "total_disbursed": money(paid + advance + other),
    }


def gym_salary_paid_in_range(db: Session, gym_id: int, start: date,
                             end: date) -> Decimal:
    """Everything actually handed out between two dates (salary + advances)."""
    total = db.scalar(
        select(func.coalesce(func.sum(StaffSalaryRecord.amount), 0)).where(
            StaffSalaryRecord.gym_id == gym_id,
            StaffSalaryRecord.paid_on >= start,
            StaffSalaryRecord.paid_on <= end,
        )
    ) or 0
    return money(total)
