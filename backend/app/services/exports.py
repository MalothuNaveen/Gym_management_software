"""CSV datasets for reports and backups.

Every dataset is a (filename, header, rows) triple so one CSV writer and one ZIP
packer can serve both the per-report Export button and the full backup.
"""
import csv
import io
import zipfile
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Attendance, Expense, Member, Membership, Payment, Receipt, Staff,
    StaffSalaryRecord, User,
)
from app.services.membership import current_membership, member_financials
from app.services.presenters import balances_for_members

DATE_FMT = "%d %b %Y"


def _d(value: date | None) -> str:
    return value.strftime(DATE_FMT) if value else ""


def _money(value) -> str:
    return f"{value:.2f}" if value is not None else "0.00"


# --------------------------------------------------------------------------
# Datasets
# --------------------------------------------------------------------------
def members_dataset(db: Session, gym_id: int, today: date, **_) -> tuple:
    members = list(
        db.scalars(
            select(Member).where(Member.gym_id == gym_id)
            .order_by(Member.member_code)
        )
    )
    balances = balances_for_members(db, [m.id for m in members])
    header = [
        "Member ID", "Name", "Phone", "WhatsApp", "Email", "Gender",
        "Date of Birth", "Address", "Emergency Contact", "Emergency Phone",
        "Joined On", "Plan", "Start Date", "Expiry Date", "Days Remaining",
        "Status", "Balance Due", "Archived",
    ]
    rows = []
    for m in members:
        current = current_membership(db, m.id)
        if not m.is_active:
            state = "Archived"
        elif current is None:
            state = "No membership"
        elif current.end_date < today:
            state = "Expired"
        else:
            state = "Active"
        rows.append([
            m.member_code, m.full_name, m.phone, m.whatsapp or "", m.email or "",
            m.gender or "", _d(m.date_of_birth), (m.address or "").replace("\n", " "),
            m.emergency_contact_name or "", m.emergency_contact_phone or "",
            _d(m.joined_on),
            current.plan_name if current else "",
            _d(current.start_date) if current else "",
            _d(current.end_date) if current else "",
            (current.end_date - today).days if current else "",
            state, _money(balances.get(m.id, 0)), "Yes" if not m.is_active else "No",
        ])
    return "members.csv", header, rows


def payments_dataset(db: Session, gym_id: int, today: date,
                     start: date | None = None, end: date | None = None,
                     **_) -> tuple:
    stmt = (
        select(Payment, Member, Receipt)
        .join(Member, Member.id == Payment.member_id)
        .outerjoin(Receipt, Receipt.payment_id == Payment.id)
        .where(Payment.gym_id == gym_id)
    )
    if start:
        stmt = stmt.where(Payment.paid_on >= start)
    if end:
        stmt = stmt.where(Payment.paid_on <= end)

    header = [
        "Receipt No", "Date", "Member ID", "Member", "Phone", "Plan", "Amount",
        "Method", "Type", "Notes", "Cancelled",
    ]
    rows = []
    for payment, member, receipt in db.execute(
        stmt.order_by(Payment.paid_on.desc(), Payment.id.desc())
    ).all():
        membership = (db.get(Membership, payment.membership_id)
                      if payment.membership_id else None)
        rows.append([
            receipt.receipt_no if receipt else "", _d(payment.paid_on),
            member.member_code, member.full_name, member.phone,
            membership.plan_name if membership else "", _money(payment.amount),
            payment.method.replace("_", " ").title(), payment.kind.title(),
            (payment.notes or "").replace("\n", " "),
            "Yes" if payment.voided_at else "No",
        ])
    return "payments.csv", header, rows


def attendance_dataset(db: Session, gym_id: int, today: date,
                       start: date | None = None, end: date | None = None,
                       **_) -> tuple:
    stmt = (
        select(Attendance, Member)
        .join(Member, Member.id == Attendance.member_id)
        .where(Attendance.gym_id == gym_id)
    )
    if start:
        stmt = stmt.where(Attendance.attend_date >= start)
    if end:
        stmt = stmt.where(Attendance.attend_date <= end)

    header = ["Date", "Time", "Member ID", "Member", "Phone"]
    rows = [
        [_d(a.attend_date), a.check_in_at.strftime("%I:%M %p"),
         m.member_code, m.full_name, m.phone]
        for a, m in db.execute(
            stmt.order_by(Attendance.attend_date.desc(),
                          Attendance.check_in_at.desc())
        ).all()
    ]
    return "attendance.csv", header, rows


def expenses_dataset(db: Session, gym_id: int, today: date,
                     start: date | None = None, end: date | None = None,
                     **_) -> tuple:
    stmt = select(Expense).where(Expense.gym_id == gym_id)
    if start:
        stmt = stmt.where(Expense.expense_date >= start)
    if end:
        stmt = stmt.where(Expense.expense_date <= end)

    header = ["Date", "Category", "Amount", "Description", "Paid By"]
    rows = [
        [_d(e.expense_date), e.category.replace("_", " ").title(),
         _money(e.amount), (e.description or "").replace("\n", " "),
         (e.method or "").replace("_", " ").title()]
        for e in db.scalars(stmt.order_by(Expense.expense_date.desc()))
    ]
    return "expenses.csv", header, rows


def staff_dataset(db: Session, gym_id: int, today: date, **_) -> tuple:
    header = ["Name", "Phone", "Email", "Role", "Joining Date",
              "Monthly Salary", "Status", "Notes"]
    rows = [
        [s.full_name, s.phone, s.email or "", s.role.title(),
         _d(s.joining_date), _money(s.monthly_salary), s.status.title(),
         (s.notes or "").replace("\n", " ")]
        for s in db.scalars(
            select(Staff).where(Staff.gym_id == gym_id).order_by(Staff.full_name)
        )
    ]
    return "staff.csv", header, rows


def salary_dataset(db: Session, gym_id: int, today: date,
                   start: date | None = None, end: date | None = None,
                   **_) -> tuple:
    stmt = (
        select(StaffSalaryRecord, Staff)
        .join(Staff, Staff.id == StaffSalaryRecord.staff_id)
        .where(StaffSalaryRecord.gym_id == gym_id)
    )
    if start:
        stmt = stmt.where(StaffSalaryRecord.paid_on >= start)
    if end:
        stmt = stmt.where(StaffSalaryRecord.paid_on <= end)

    header = ["Paid On", "Staff", "For Month", "Type", "Amount", "Method", "Notes"]
    rows = [
        [_d(r.paid_on), s.full_name, r.period_month.strftime("%b %Y"),
         r.kind.title(), _money(r.amount),
         (r.method or "").replace("_", " ").title(),
         (r.notes or "").replace("\n", " ")]
        for r, s in db.execute(
            stmt.order_by(StaffSalaryRecord.paid_on.desc())
        ).all()
    ]
    return "staff_salary.csv", header, rows


def memberships_dataset(db: Session, gym_id: int, today: date, **_) -> tuple:
    header = ["Member ID", "Member", "Plan", "Start", "Expiry", "Fee",
              "Discount", "Net Amount", "Status"]
    rows = [
        [m.member_code, m.full_name, ms.plan_name, _d(ms.start_date),
         _d(ms.end_date), _money(ms.fee), _money(ms.discount),
         _money(ms.final_amount),
         "Active" if ms.end_date >= today else "Expired"]
        for ms, m in db.execute(
            select(Membership, Member)
            .join(Member, Member.id == Membership.member_id)
            .where(Membership.gym_id == gym_id)
            .order_by(Membership.start_date.desc())
        ).all()
    ]
    return "memberships.csv", header, rows


def expiring_dataset(db: Session, gym_id: int, today: date,
                     days: int = 30, **_) -> tuple:
    from datetime import timedelta

    cutoff = today + timedelta(days=days)
    header = ["Member ID", "Member", "Phone", "WhatsApp", "Plan", "Expiry",
              "Days Remaining", "Balance Due"]
    members = list(
        db.scalars(
            select(Member).where(Member.gym_id == gym_id,
                                 Member.is_active.is_(True))
        )
    )
    balances = balances_for_members(db, [m.id for m in members])
    rows = []
    for m in members:
        current = current_membership(db, m.id)
        if not current or current.end_date > cutoff:
            continue
        rows.append([
            m.member_code, m.full_name, m.phone, m.whatsapp or m.phone,
            current.plan_name, _d(current.end_date),
            (current.end_date - today).days, _money(balances.get(m.id, 0)),
        ])
    rows.sort(key=lambda r: r[6])
    return "expiring.csv", header, rows


def dues_dataset(db: Session, gym_id: int, today: date, **_) -> tuple:
    """Who owes money - the report the owner actually chases."""
    header = ["Member ID", "Member", "Phone", "Total Charged", "Total Paid",
              "Balance Due"]
    rows = []
    for m in db.scalars(
        select(Member).where(Member.gym_id == gym_id, Member.is_active.is_(True))
        .order_by(Member.full_name)
    ):
        fin = member_financials(db, m.id)
        if fin["balance"] <= 0:
            continue
        rows.append([m.member_code, m.full_name, m.phone,
                     _money(fin["total_charged"]), _money(fin["total_paid"]),
                     _money(fin["balance"])])
    rows.sort(key=lambda r: float(r[5]), reverse=True)
    return "pending_dues.csv", header, rows


def users_dataset(db: Session, gym_id: int, today: date, **_) -> tuple:
    """Login accounts, without password hashes."""
    header = ["Name", "Email", "Phone", "Role", "Active"]
    rows = [
        [u.full_name, u.email, u.phone or "", u.role.title(),
         "Yes" if u.is_active else "No"]
        for u in db.scalars(select(User).where(User.gym_id == gym_id))
    ]
    return "users.csv", header, rows


DATASETS = {
    "members": members_dataset,
    "payments": payments_dataset,
    "attendance": attendance_dataset,
    "expenses": expenses_dataset,
    "staff": staff_dataset,
    "salary": salary_dataset,
    "memberships": memberships_dataset,
    "expiring": expiring_dataset,
    "dues": dues_dataset,
}

# Everything included in a full backup archive.
BACKUP_DATASETS = [
    "members", "memberships", "payments", "attendance", "expenses", "staff",
    "salary", "dues",
]


# --------------------------------------------------------------------------
# Writers
# --------------------------------------------------------------------------
def to_csv(header: list[str], rows: list[list]) -> bytes:
    buf = io.StringIO(newline="")
    writer = csv.writer(buf, lineterminator="\r\n")
    writer.writerow(header)
    writer.writerows(rows)
    # BOM so Excel opens Indian names and the rupee sign correctly.
    return b"\xef\xbb\xbf" + buf.getvalue().encode("utf-8")


def build_backup_zip(db: Session, gym_id: int, today: date) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in BACKUP_DATASETS:
            filename, header, rows = DATASETS[name](db, gym_id, today)
            archive.writestr(filename, to_csv(header, rows))
        filename, header, rows = users_dataset(db, gym_id, today)
        archive.writestr(filename, to_csv(header, rows))
        archive.writestr(
            "README.txt",
            "Gym Management System backup\r\n"
            f"Exported on {today.strftime(DATE_FMT)}\r\n\r\n"
            "Each CSV opens directly in Excel or Google Sheets.\r\n"
            "Keep this file somewhere safe - it contains member details.\r\n",
        )
    return buf.getvalue()
