"""Shared field types and validators used across every request schema."""
from datetime import date
from decimal import Decimal
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

from app.services.money import MoneyError, money

T = TypeVar("T")


def _clean_money(v):
    if v is None or v == "":
        return Decimal("0.00")
    try:
        return money(v)
    except MoneyError as exc:
        raise ValueError(str(exc)) from exc


def _clean_phone(v):
    """Accept what a human types, store just the digits (with +91 stripped).

    '+91 98765 43210', '098765-43210' and '9876543210' all become the same
    value, so searching by phone actually finds the member.
    """
    if v is None:
        return None
    raw = str(v).strip()
    if not raw:
        return None
    digits = "".join(ch for ch in raw if ch.isdigit())
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if not 7 <= len(digits) <= 15:
        raise ValueError("must be a valid phone number")
    return digits


def _trim(v):
    return v.strip() if isinstance(v, str) else v


def _blank_to_none(v):
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


# Amount of money that may not be negative.
Money = Annotated[Decimal, BeforeValidator(_clean_money)]
# Required phone number.
Phone = Annotated[str, BeforeValidator(_clean_phone), Field(min_length=7)]
# Optional phone number.
OptPhone = Annotated[str | None, BeforeValidator(_clean_phone)]
# Trimmed, required text.
Name = Annotated[str, BeforeValidator(_trim), Field(min_length=2, max_length=120)]
# Optional text that turns empty strings into NULL rather than ''.
OptStr = Annotated[str | None, BeforeValidator(_blank_to_none)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    """A single page of results plus what the UI needs to render a pager."""
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


def paginate(items: list, total: int, page: int, page_size: int) -> dict:
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)) if page_size else 1,
    }


class MessageOut(BaseModel):
    message: str


class DateRange(BaseModel):
    start: date
    end: date
