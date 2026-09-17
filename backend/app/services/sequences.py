"""Allocation of member codes and receipt numbers.

Both counters live on the gym's settings row. We take a row-level lock before
incrementing (a no-op on SQLite, a real FOR UPDATE on Postgres) so two
simultaneous saves can never be handed the same number. The unique constraints
on `members.member_code` and `receipts.receipt_no` are the final backstop.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import GymSettings


def _lock_settings(db: Session, gym_id: int) -> GymSettings:
    row = db.scalar(
        select(GymSettings).where(GymSettings.gym_id == gym_id).with_for_update()
    )
    if not row:
        raise AppError("Gym settings are not configured yet.")
    return row


def next_member_code(db: Session, gym_id: int) -> str:
    """GYM-0001, GYM-0002, ... - never reused, never duplicated."""
    row = _lock_settings(db, gym_id)
    row.member_seq += 1
    db.flush()
    return f"{row.member_code_prefix}-{row.member_seq:04d}"


def next_receipt_no(db: Session, gym_id: int, year: int) -> str:
    """REC-2026-0001, REC-2026-0002, ... - the counter restarts each year."""
    row = _lock_settings(db, gym_id)
    if row.receipt_year != year:
        row.receipt_year = year
        row.receipt_seq = 0
    row.receipt_seq += 1
    db.flush()
    return f"{row.receipt_prefix}-{year}-{row.receipt_seq:04d}"
