"""Renewal reminders: prepare them, record what happened, read the history.

The server builds the message and validates the number; the browser is what
actually opens WhatsApp. That split matters - it means the wording lives in one
place, and it means the day a WhatsApp Business API is connected only this
module changes, not the screens.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession, get_gym
from app.models import Member, Message
from app.routers.members import expiring_members
from app.schemas.common import MessageOut as PlainMessage
from app.schemas.messaging import (
    MessageLogBatchIn, MessageLogIn, MessageOut, PreparedReminder, RemindersOut,
)
from app.services.messaging import build_renewal_message, to_dialable
from app.services.money import money_str

router = APIRouter(prefix="/messages", tags=["messages"])


@router.get("/renewal-reminders", response_model=RemindersOut)
def renewal_reminders(user: CurrentUser, db: DbSession,
                      days: int = Query(7, ge=1, le=365)):
    """Build a reminder for every member who needs renewing.

    Reuses the existing expiring-members query rather than repeating its rules,
    so "who needs renewing" has exactly one definition in the codebase.
    """
    gym = get_gym(db, user.gym_id)
    expiring = expiring_members(user, db, days=days)

    reminders: list[PreparedReminder] = []
    for member in expiring:
        # The dedicated WhatsApp number wins; the main phone is the fallback.
        check = to_dialable(member.whatsapp or member.phone)
        reminders.append(PreparedReminder(
            member_id=member.member_id,
            member_code=member.member_code,
            full_name=member.full_name,
            phone=member.whatsapp or member.phone,
            dial=check.dial,
            can_send=check.ok,
            reason=check.reason,
            plan_name=member.plan_name,
            end_date=member.end_date,
            days_remaining=member.days_remaining,
            balance=member.balance,
            has_photo=member.has_photo,
            message=build_renewal_message(
                member_name=member.full_name,
                gym_name=gym.name,
                expiry_date=member.end_date,
                days_remaining=member.days_remaining,
                balance=money_str(member.balance),
            ),
        ))

    sendable = sum(1 for r in reminders if r.can_send)
    return RemindersOut(
        gym_name=gym.name,
        total=len(reminders),
        sendable=sendable,
        unreachable=len(reminders) - sendable,
        reminders=reminders,
    )


def _record(db: DbSession, gym_id: int, user_id: int, entry: MessageLogIn) -> Message:
    row = Message(
        gym_id=gym_id,
        member_id=entry.member_id,
        member_name=entry.member_name,
        phone=entry.phone,
        channel=entry.channel,
        kind=entry.kind,
        status=entry.status,
        detail=entry.detail,
        body=entry.body,
        related_date=entry.related_date,
        sent_by_user_id=user_id,
        # Only a status that means the message left the building gets a time.
        sent_at=(datetime.now(timezone.utc)
                 if entry.status in ("opened", "sent") else None),
    )
    db.add(row)
    return row


@router.post("", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def log_message(payload: MessageLogIn, user: CurrentUser, db: DbSession):
    """Record one reminder. Never claims delivery the app cannot observe."""
    row = _record(db, user.gym_id, user.id, payload)
    db.commit()
    db.refresh(row)
    return row


@router.post("/batch", response_model=list[MessageOut],
             status_code=status.HTTP_201_CREATED)
def log_messages(payload: MessageLogBatchIn, user: CurrentUser, db: DbSession):
    """Record a whole reminder run in one request."""
    rows = [_record(db, user.gym_id, user.id, entry) for entry in payload.messages]
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


@router.get("", response_model=dict)
def list_messages(user: CurrentUser, db: DbSession,
                  page: int = Query(1, ge=1),
                  page_size: int = Query(25, ge=1, le=100),
                  kind: str | None = None,
                  status_filter: str | None = Query(None, alias="status")):
    stmt = select(Message).where(Message.gym_id == user.gym_id)
    if kind:
        stmt = stmt.where(Message.kind == kind)
    if status_filter:
        stmt = stmt.where(Message.status == status_filter)

    total = db.scalar(
        select(func.count()).select_from(stmt.subquery())
    ) or 0
    rows = list(db.scalars(
        stmt.order_by(Message.created_at.desc(), Message.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ))

    return {
        "items": [MessageOut.model_validate(r).model_dump(mode="json") for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/stats", response_model=dict)
def message_stats(user: CurrentUser, db: DbSession):
    """Counts per status, for the Messages screen header."""
    rows = db.execute(
        select(Message.status, func.count(Message.id))
        .where(Message.gym_id == user.gym_id)
        .group_by(Message.status)
    ).all()
    counts = {status_: count for status_, count in rows}
    return {
        "total": sum(counts.values()),
        "opened": counts.get("opened", 0),
        "sent": counts.get("sent", 0),
        "prepared": counts.get("prepared", 0),
        "failed": counts.get("failed", 0),
    }


@router.delete("/{message_id}", response_model=PlainMessage)
def delete_message(message_id: int, user: CurrentUser, db: DbSession):
    """Removes one history row. Messages are a log, not a financial record."""
    row = db.get(Message, message_id)
    if not row or row.gym_id != user.gym_id:
        return PlainMessage(message="That message is no longer in the history.")
    db.delete(row)
    db.commit()
    return PlainMessage(message="Removed from the message history.")


def member_phone_for(db: DbSession, gym_id: int, member_id: int) -> str | None:
    """The number a one-off reminder should use for this member."""
    member = db.get(Member, member_id)
    if not member or member.gym_id != gym_id:
        return None
    return member.whatsapp or member.phone
