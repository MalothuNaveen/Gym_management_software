"""Staff and salary schemas."""
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import Money, Name, ORMModel, OptPhone, OptStr, Phone

VALID_ROLES = {"owner", "admin", "trainer", "other"}
VALID_KINDS = {"salary", "advance", "other"}
VALID_METHODS = {"cash", "upi", "card", "bank_transfer", "other"}


class StaffIn(BaseModel):
    full_name: Name
    phone: Phone
    email: OptStr = None
    role: str = "other"
    joining_date: date | None = None
    monthly_salary: Money = Decimal("0.00")
    status: str = "active"
    notes: OptStr = None

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in VALID_ROLES:
            raise ValueError("must be owner, admin, trainer or other")
        return v

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in ("active", "inactive"):
            raise ValueError("must be active or inactive")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        if v and ("@" not in v or "." not in v.split("@")[-1]):
            raise ValueError("must be a valid email address")
        return v.lower() if v else v


class StaffUpdate(BaseModel):
    full_name: Name | None = None
    phone: OptPhone = None
    email: OptStr = None
    role: str | None = None
    joining_date: date | None = None
    monthly_salary: Money | None = None
    status: str | None = None
    notes: OptStr = None


class SalarySummaryOut(BaseModel):
    period_month: date
    monthly_salary: Decimal
    paid: Decimal
    advance: Decimal
    other: Decimal
    remaining: Decimal
    total_disbursed: Decimal


class StaffOut(ORMModel):
    id: int
    full_name: str
    phone: str
    email: str | None = None
    role: str
    joining_date: date | None = None
    monthly_salary: Decimal
    status: str
    notes: str | None = None
    has_photo: bool = False
    salary: SalarySummaryOut | None = None


class SalaryRecordIn(BaseModel):
    staff_id: int
    amount: Money
    kind: str = "salary"
    # Any date inside the target month; stored normalised to the 1st.
    period_month: date | None = None
    paid_on: date | None = None
    method: OptStr = None
    notes: OptStr = None

    @field_validator("amount")
    @classmethod
    def _positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("must be greater than zero")
        return v

    @field_validator("kind")
    @classmethod
    def _kind(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in VALID_KINDS:
            raise ValueError("must be salary, advance or other")
        return v

    @field_validator("method")
    @classmethod
    def _method(cls, v):
        if v is None:
            return v
        v = v.strip().lower()
        if v not in VALID_METHODS:
            raise ValueError("must be a valid payment method")
        return v


class SalaryRecordOut(ORMModel):
    id: int
    staff_id: int
    staff_name: str | None = None
    period_month: date
    kind: str
    amount: Decimal
    paid_on: date
    method: str | None = None
    notes: str | None = None
    created_at: datetime | None = None


class StaffDetail(StaffOut):
    salary_records: list[SalaryRecordOut] = Field(default_factory=list)
