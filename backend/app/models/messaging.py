"""A log of reminders the gym has sent to members.

Deliberately records what actually happened rather than what we would like to
claim. Without a WhatsApp Business API the application can only *open* WhatsApp
with a prefilled message - it never learns whether the owner pressed send. The
status column is honest about that distinction, so the day a real provider is
connected the same table can start recording genuine delivery.
"""
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin

# What the application can truthfully say about one reminder.
#   prepared -> the message was built but never handed to WhatsApp
#   opened   -> WhatsApp was opened with the message ready to send
#   sent     -> a provider confirmed delivery (requires a Business API)
#   failed   -> could not be attempted, e.g. no usable phone number
MESSAGE_STATUSES = ("prepared", "opened", "sent", "failed")

MESSAGE_CHANNELS = ("whatsapp", "sms", "email")

MESSAGE_KINDS = ("renewal_reminder", "payment_reminder", "receipt", "other")


class Message(Base, TimestampMixin):
    """One reminder, to one member, on one channel."""

    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_gym_created", "gym_id", "created_at"),
        Index("ix_messages_gym_member", "gym_id", "member_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gym_id: Mapped[int] = mapped_column(
        ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Kept even if the member is later archived, so history stays readable.
    member_id: Mapped[int | None] = mapped_column(
        ForeignKey("members.id", ondelete="SET NULL")
    )
    # Copied at send time: the log must still make sense if the member's name
    # or number changes afterwards.
    member_name: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))

    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="whatsapp")
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="renewal_reminder")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="prepared")
    # Why a message failed, in words the owner can act on.
    detail: Mapped[str | None] = mapped_column(String(255))

    body: Mapped[str] = mapped_column(Text, nullable=False)

    # The membership expiry this reminder was about, for renewal reminders.
    related_date: Mapped[date | None] = mapped_column(Date)
    sent_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
