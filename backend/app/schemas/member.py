"""Member, plan and membership schemas."""
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import (
    Money, Name, ORMModel, OptPhone, OptStr, Phone,
)


# --------------------------------------------------------------------------
# Membership plans
# --------------------------------------------------------------------------
class PlanIn(BaseModel):
    name: Name
    price: Money
    duration_days: int = Field(ge=1, le=3650)
    description: OptStr = None
    sort_order: int = 0
    is_active: bool = True


class PlanUpdate(BaseModel):
    name: Name | None = None
    price: Money | None = None
    duration_days: int | None = Field(default=None, ge=1, le=3650)
    description: OptStr = None
    sort_order: int | None = None
    is_active: bool | None = None


class PlanOut(ORMModel):
    id: int
    name: str
    price: Decimal
    duration_days: int
    description: str | None = None
    is_active: bool
    sort_order: int
    # Populated on the list endpoint so the UI can warn before deactivating.
    members_using: int = 0


# --------------------------------------------------------------------------
# Memberships
# --------------------------------------------------------------------------
class MembershipIn(BaseModel):
    """A term being sold - either with a new member or as a renewal."""
    plan_id: int | None = None
    plan_name: OptStr = None
    start_date: date
    end_date: date | None = None          # derived from the plan when omitted
    fee: Money
    discount: Money = Decimal("0.00")
    duration_days: int | None = Field(default=None, ge=1, le=3650)
    notes: OptStr = None

    @model_validator(mode="after")
    def _check(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("The end date cannot be before the start date.")
        if not self.plan_id and not self.end_date and not self.duration_days:
            raise ValueError(
                "Choose a plan, or set an end date for this membership."
            )
        if not self.plan_id and not self.plan_name and not self.end_date:
            raise ValueError("Please choose a membership plan.")
        return self


class MembershipOut(ORMModel):
    id: int
    plan_id: int | None = None
    plan_name: str
    start_date: date
    end_date: date
    fee: Decimal
    discount: Decimal
    final_amount: Decimal
    status: str
    notes: str | None = None
    paid: Decimal = Decimal("0.00")
    balance: Decimal = Decimal("0.00")
    days_remaining: int | None = None


# --------------------------------------------------------------------------
# Payment attached to a member/membership form
# --------------------------------------------------------------------------
VALID_METHODS = {"cash", "upi", "card", "bank_transfer", "other"}


class InlinePaymentIn(BaseModel):
    """The payment captured on the same screen as the membership."""
    amount: Money = Decimal("0.00")
    method: str = "cash"
    paid_on: date | None = None
    notes: OptStr = None

    @field_validator("method")
    @classmethod
    def _method(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in VALID_METHODS:
            raise ValueError("must be a valid payment method")
        return v


# --------------------------------------------------------------------------
# Members
# --------------------------------------------------------------------------
class MemberBase(BaseModel):
    full_name: Name
    phone: Phone
    whatsapp: OptPhone = None
    email: OptStr = None
    date_of_birth: date | None = None
    gender: OptStr = None
    address: OptStr = None
    emergency_contact_name: OptStr = None
    emergency_contact_phone: OptPhone = None
    notes: OptStr = None

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        if v and ("@" not in v or "." not in v.split("@")[-1]):
            raise ValueError("must be a valid email address")
        return v.lower() if v else v

    @field_validator("gender")
    @classmethod
    def _gender(cls, v):
        if v and v.lower() not in ("male", "female", "other"):
            raise ValueError("must be male, female or other")
        return v.lower() if v else v

    @field_validator("date_of_birth")
    @classmethod
    def _dob(cls, v):
        if v and v > date.today():
            raise ValueError("cannot be in the future")
        return v


class MemberCreate(MemberBase):
    """Everything the Add Member screen submits, in one request."""
    joined_on: date | None = None
    membership: MembershipIn | None = None
    payment: InlinePaymentIn | None = None


class MemberUpdate(BaseModel):
    full_name: Name | None = None
    phone: OptPhone = None
    whatsapp: OptPhone = None
    email: OptStr = None
    date_of_birth: date | None = None
    gender: OptStr = None
    address: OptStr = None
    emergency_contact_name: OptStr = None
    emergency_contact_phone: OptPhone = None
    notes: OptStr = None
    is_active: bool | None = None


class MemberListItem(ORMModel):
    id: int
    member_code: str
    full_name: str
    phone: str
    email: str | None = None
    has_photo: bool = False
    status: str = "no_membership"
    plan_name: str | None = None
    end_date: date | None = None
    days_remaining: int | None = None
    balance: Decimal = Decimal("0.00")
    is_active: bool = True


class MemberFinancials(BaseModel):
    total_charged: Decimal
    total_paid: Decimal
    balance: Decimal
    credit: Decimal


class MemberAttendanceSummary(BaseModel):
    total_visits: int
    this_month: int
    last_visit: date | None = None


class MemberDetail(ORMModel):
    id: int
    member_code: str
    full_name: str
    phone: str
    whatsapp: str | None = None
    email: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    address: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    notes: str | None = None
    joined_on: date
    is_active: bool
    has_photo: bool = False

    status: str = "no_membership"
    current_membership: MembershipOut | None = None
    days_remaining: int | None = None
    financials: MemberFinancials
    attendance: MemberAttendanceSummary
    memberships: list[MembershipOut] = []


class RenewIn(BaseModel):
    """Renewal = a new membership term, optionally with the payment for it."""
    membership: MembershipIn
    payment: InlinePaymentIn | None = None


class MemberCreatedOut(BaseModel):
    """What the Add Member flow needs to jump straight to the receipt."""
    member: MemberDetail
    receipt_id: int | None = None
    receipt_no: str | None = None
    payment_id: int | None = None
