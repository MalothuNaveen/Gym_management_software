"""Payment, receipt and expense schemas."""
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import Money, ORMModel, OptStr

VALID_METHODS = {"cash", "upi", "card", "bank_transfer", "other"}
VALID_KINDS = {"membership", "advance", "other"}
VALID_EXPENSE_CATEGORIES = {
    "rent", "electricity", "equipment", "maintenance", "cleaning",
    "staff_salary", "other",
}


class PaymentIn(BaseModel):
    member_id: int
    amount: Money
    method: str = "cash"
    # Omit to settle the member's current outstanding term automatically.
    membership_id: int | None = None
    kind: str | None = None
    paid_on: date | None = None
    notes: OptStr = None

    @field_validator("amount")
    @classmethod
    def _positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("must be greater than zero")
        return v

    @field_validator("method")
    @classmethod
    def _method(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in VALID_METHODS:
            raise ValueError("must be a valid payment method")
        return v

    @field_validator("kind")
    @classmethod
    def _kind(cls, v):
        if v is None:
            return v
        v = v.strip().lower()
        if v not in VALID_KINDS:
            raise ValueError("must be membership, advance or other")
        return v


class PaymentOut(ORMModel):
    id: int
    member_id: int
    member_name: str | None = None
    member_code: str | None = None
    membership_id: int | None = None
    plan_name: str | None = None
    amount: Decimal
    method: str
    kind: str
    paid_on: date
    notes: str | None = None
    is_void: bool = False
    void_reason: str | None = None
    receipt_id: int | None = None
    receipt_no: str | None = None


class PaymentVoidIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


class ReceiptOut(ORMModel):
    id: int
    receipt_no: str
    issued_on: date
    payment_id: int
    member_id: int | None = None
    snapshot: dict


class ExpenseIn(BaseModel):
    expense_date: date
    category: str
    amount: Money
    description: OptStr = None
    method: OptStr = None

    @field_validator("amount")
    @classmethod
    def _positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("must be greater than zero")
        return v

    @field_validator("category")
    @classmethod
    def _category(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in VALID_EXPENSE_CATEGORIES:
            raise ValueError("must be a valid expense category")
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


class ExpenseOut(ORMModel):
    id: int
    expense_date: date
    category: str
    amount: Decimal
    description: str | None = None
    method: str | None = None
