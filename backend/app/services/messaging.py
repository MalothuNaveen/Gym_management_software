"""Building reminder messages, and getting a phone number into a dialable form.

One place owns the wording and one place owns the number handling, so a change
of template never means hunting through screens, and no component has to invent
its own idea of what a valid Indian mobile number looks like.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

# Numbers are stored as bare digits with +91 stripped (see schemas/common.py).
# WhatsApp needs them the other way round: full international, no punctuation.
DEFAULT_COUNTRY_CODE = "91"

# An Indian mobile number is ten digits starting 6-9. Landlines and short codes
# cannot receive WhatsApp, so they are rejected rather than silently attempted.
_INDIAN_MOBILE = re.compile(r"^[6-9]\d{9}$")

RENEWAL_TEMPLATE = (
    "Hi {member_name} 👋\n"
    "\n"
    "Your membership at {gym_name} is expiring on {expiry_date}.\n"
    "\n"
    "Please renew to continue your fitness journey without interruption.\n"
    "\n"
    "Stay strong 💪\n"
    "{gym_name}"
)

EXPIRED_TEMPLATE = (
    "Hi {member_name} 👋\n"
    "\n"
    "Your membership at {gym_name} expired on {expiry_date}.\n"
    "\n"
    "Renew now and pick up right where you left off - we have kept your spot.\n"
    "\n"
    "Stay strong 💪\n"
    "{gym_name}"
)

# Appended only when there is actually something outstanding.
DUE_LINE = "\n\nPending balance: ₹{balance}"


@dataclass(frozen=True)
class PhoneCheck:
    """The result of looking at one number, and why it was judged that way."""

    ok: bool
    dial: str | None = None       # full international digits, e.g. 919876543210
    reason: str | None = None     # plain English, shown straight to the owner


def to_dialable(raw: str | None, country_code: str = DEFAULT_COUNTRY_CODE) -> PhoneCheck:
    """Turn a stored number into something WhatsApp will accept.

    Rejects rather than guesses. A message sent to a wrong number is worse than
    a message the owner is told they need to fix.
    """
    if not raw or not raw.strip():
        return PhoneCheck(False, reason="No phone number on file.")

    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits:
        return PhoneCheck(False, reason="The phone number has no digits.")

    # Already carries a country code.
    if digits.startswith(country_code) and len(digits) == len(country_code) + 10:
        national = digits[len(country_code):]
    elif digits.startswith("0") and len(digits) == 11:
        national = digits[1:]
    else:
        national = digits

    if len(national) != 10:
        return PhoneCheck(
            False,
            reason=f"“{raw}” is not a 10-digit mobile number.",
        )
    if not _INDIAN_MOBILE.match(national):
        return PhoneCheck(
            False,
            reason=f"“{raw}” does not look like a mobile number that can use WhatsApp.",
        )

    return PhoneCheck(True, dial=f"{country_code}{national}")


def first_name(full_name: str) -> str:
    """'Anita Sharma' -> 'Anita'. Greeting someone by their full name reads
    like a bank letter, not a message from the gym they walk into."""
    return (full_name or "").strip().split(" ")[0] or "there"


def format_expiry(value: date) -> str:
    """20 Sep 2026 - never the ambiguous 09/20/26."""
    return f"{value.day} {value.strftime('%b')} {value.year}"


def build_renewal_message(
    *,
    member_name: str,
    gym_name: str,
    expiry_date: date,
    days_remaining: int,
    balance: str | None = None,
) -> str:
    """The one place renewal wording is decided."""
    template = EXPIRED_TEMPLATE if days_remaining < 0 else RENEWAL_TEMPLATE
    message = template.format(
        member_name=first_name(member_name),
        gym_name=gym_name,
        expiry_date=format_expiry(expiry_date),
    )
    if balance is not None and _positive(balance):
        message += DUE_LINE.format(balance=balance)
    return message


def _positive(amount: str) -> bool:
    try:
        return float(amount) > 0
    except (TypeError, ValueError):
        return False
