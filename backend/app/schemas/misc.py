"""Attendance, gym settings, dashboard and report schemas."""
from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel, OptPhone, OptStr


# --------------------------------------------------------------------------
# Attendance
# --------------------------------------------------------------------------
class CheckInIn(BaseModel):
    member_id: int
    # Defaults to today in the gym's timezone.
    attend_date: date | None = None


class AttendanceOut(ORMModel):
    id: int
    member_id: int
    member_name: str | None = None
    member_code: str | None = None
    attend_date: date
    check_in_at: datetime
    marked_by: str | None = None


class AttendanceRosterItem(BaseModel):
    """One row of the attendance screen: every active member, present or not."""
    member_id: int
    member_code: str
    full_name: str
    phone: str
    has_photo: bool = False
    status: str
    present: bool = False
    check_in_at: datetime | None = None
    attendance_id: int | None = None


# --------------------------------------------------------------------------
# Gym settings
# --------------------------------------------------------------------------
class GymSettingsOut(BaseModel):
    gym_id: int
    name: str
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    whatsapp_number: str | None = None
    has_logo: bool = False
    currency: str
    timezone: str
    receipt_footer: str
    default_plan_id: int | None = None
    expiring_soon_days: int
    open_time: time | None = None
    close_time: time | None = None
    member_code_prefix: str
    receipt_prefix: str


class GymSettingsIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    address: OptStr = None
    phone: OptPhone = None
    email: OptStr = None
    whatsapp_number: OptPhone = None
    currency: str | None = None
    timezone: str | None = None
    receipt_footer: OptStr = None
    default_plan_id: int | None = None
    expiring_soon_days: int | None = Field(default=None, ge=1, le=90)
    open_time: time | None = None
    close_time: time | None = None
    member_code_prefix: str | None = Field(default=None, min_length=1,
                                           max_length=12)
    receipt_prefix: str | None = Field(default=None, min_length=1, max_length=12)

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v):
        if v is None:
            return v
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("is not a recognised timezone") from exc
        return v

    @field_validator("member_code_prefix", "receipt_prefix")
    @classmethod
    def _prefix(cls, v):
        if v is None:
            return v
        v = v.strip().upper()
        if not v.isalnum():
            raise ValueError("may only contain letters and numbers")
        return v


# --------------------------------------------------------------------------
# Dashboard
# --------------------------------------------------------------------------
class DashboardMembers(BaseModel):
    total: int
    active: int
    expiring_soon: int
    expired: int
    no_membership: int


class DashboardMoney(BaseModel):
    today_collection: Decimal
    month_collection: Decimal
    pending_payments: Decimal
    month_expenses: Decimal
    month_net: Decimal


class DashboardAttendance(BaseModel):
    today_count: int
    active_members: int
    # Derived here so every screen agrees on the same figure.
    not_checked_in: int = 0
    percent: int = 0


class DashboardPaymentStatus(BaseModel):
    """Members grouped by where they stand on money, not payments grouped by
    method - the owner's question is "who owes me", not "how did it arrive"."""

    paid_count: int = 0
    pending_count: int = 0
    overdue_count: int = 0
    paid_amount: Decimal = Decimal("0.00")
    pending_amount: Decimal = Decimal("0.00")
    overdue_amount: Decimal = Decimal("0.00")


class RecentMemberOut(BaseModel):
    member_id: int
    member_code: str
    full_name: str
    phone: str
    has_photo: bool = False
    joined_on: date | None = None
    plan_name: str | None = None
    status: str = "no_membership"
    end_date: date | None = None
    days_remaining: int | None = None


class ExpiringMemberOut(BaseModel):
    member_id: int
    member_code: str
    full_name: str
    phone: str
    whatsapp: str | None = None
    has_photo: bool = False
    plan_name: str | None = None
    end_date: date
    days_remaining: int
    balance: Decimal = Decimal("0.00")


class DashboardOut(BaseModel):
    gym_name: str
    today: date
    members: DashboardMembers
    money: DashboardMoney
    attendance: DashboardAttendance
    expiring: list[ExpiringMemberOut]
    # Added for the redesigned dashboard. Both default, so any older client
    # reading this response keeps working exactly as before.
    payment_status: DashboardPaymentStatus = DashboardPaymentStatus()
    recent_members: list[RecentMemberOut] = []


# --------------------------------------------------------------------------
# Reports
# --------------------------------------------------------------------------
class MonthlySummaryOut(BaseModel):
    month: str
    period_start: date
    period_end: date
    total_members: int
    new_members: int
    renewals: int
    active_members: int
    expired_members: int
    total_revenue: Decimal
    total_expenses: Decimal
    staff_salary_paid: Decimal
    pending_payments: Decimal
    attendance_count: int
    net_amount: Decimal
