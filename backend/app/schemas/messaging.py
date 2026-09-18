"""Request and response shapes for reminder messages and global search."""
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.models.messaging import MESSAGE_CHANNELS, MESSAGE_KINDS, MESSAGE_STATUSES
from app.schemas.common import ORMModel, OptStr


class PreparedReminder(BaseModel):
    """A reminder built on the server, with the phone already validated."""

    member_id: int
    member_code: str
    full_name: str
    phone: str | None = None
    # Full international digits, ready for wa.me. None when unusable.
    dial: str | None = None
    can_send: bool
    # Why it cannot be sent, in words the owner can act on.
    reason: str | None = None
    plan_name: str | None = None
    end_date: date
    days_remaining: int
    balance: Decimal = Decimal("0.00")
    has_photo: bool = False
    message: str


class RemindersOut(BaseModel):
    gym_name: str
    total: int
    sendable: int
    unreachable: int
    reminders: list[PreparedReminder]


class MessageLogIn(BaseModel):
    """Records what actually happened to one reminder."""

    member_id: int | None = None
    member_name: str = Field(min_length=1, max_length=160)
    phone: OptStr = None
    channel: str = "whatsapp"
    kind: str = "renewal_reminder"
    status: str = "prepared"
    detail: OptStr = None
    body: str = Field(min_length=1)
    related_date: date | None = None

    @field_validator("channel")
    @classmethod
    def _channel(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in MESSAGE_CHANNELS:
            raise ValueError("must be a valid channel")
        return v

    @field_validator("kind")
    @classmethod
    def _kind(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in MESSAGE_KINDS:
            raise ValueError("must be a valid message type")
        return v

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in MESSAGE_STATUSES:
            raise ValueError("must be a valid status")
        return v


class MessageLogBatchIn(BaseModel):
    messages: list[MessageLogIn] = Field(min_length=1, max_length=200)


class MessageOut(ORMModel):
    id: int
    member_id: int | None = None
    member_name: str
    phone: str | None = None
    channel: str
    kind: str
    status: str
    detail: str | None = None
    body: str
    related_date: date | None = None
    sent_at: datetime | None = None
    created_at: datetime


# --- Global search --------------------------------------------------------

class SearchHit(BaseModel):
    """One result, already carrying where it should navigate to."""

    id: int
    title: str
    subtitle: str | None = None
    to: str
    badge: str | None = None


class SearchGroup(BaseModel):
    label: str
    hits: list[SearchHit]


class SearchOut(BaseModel):
    query: str
    total: int
    groups: list[SearchGroup]


# --- Revenue series -------------------------------------------------------

class RevenuePoint(BaseModel):
    # The bucket start: a day, a week's Monday, or a month's first.
    date: date
    label: str
    income: Decimal
    expense: Decimal
    net: Decimal


class RevenueSeriesOut(BaseModel):
    period: str
    start: date
    end: date
    total_income: Decimal
    total_expense: Decimal
    total_net: Decimal
    points: list[RevenuePoint]
