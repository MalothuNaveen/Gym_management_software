"""Money handling. Every rupee amount in the system passes through here.

Rules enforced:
  * amounts are Decimal, quantized to 2 places, never float
  * amounts that represent a charge or payment may not be negative
  * formatting uses the Indian digit grouping (1,25,000 not 125,000)
"""
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

TWO_PLACES = Decimal("0.01")
ZERO = Decimal("0.00")


class MoneyError(ValueError):
    """Raised when a value cannot be treated as a valid rupee amount."""


def money(value, *, field: str = "amount", allow_negative: bool = False) -> Decimal:
    """Coerce any incoming value to a clean 2-decimal Decimal."""
    if value is None:
        return ZERO
    try:
        amount = Decimal(str(value)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ArithmeticError, TypeError) as exc:
        raise MoneyError(f"Please enter a valid {field}.") from exc

    if not amount.is_finite():
        raise MoneyError(f"Please enter a valid {field}.")
    if not allow_negative and amount < ZERO:
        raise MoneyError(f"The {field} cannot be negative.")
    return amount


def add(*values) -> Decimal:
    total = ZERO
    for v in values:
        total += money(v, allow_negative=True)
    return total.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def subtract(a, b) -> Decimal:
    return (money(a, allow_negative=True) - money(b, allow_negative=True)).quantize(
        TWO_PLACES, rounding=ROUND_HALF_UP
    )


def compute_final_amount(fee, discount) -> Decimal:
    """Final Amount = Membership Fee - Discount.

    The discount is capped at the fee so a typo can never produce a negative
    charge, and the owner never has to do this arithmetic by hand.
    """
    fee_d = money(fee, field="membership fee")
    disc_d = money(discount, field="discount")
    if disc_d > fee_d:
        raise MoneyError("The discount cannot be more than the membership fee.")
    return subtract(fee_d, disc_d)


def compute_balance(final_amount, amount_paid) -> Decimal:
    """Balance = Final Amount - Amount Paid.

    A negative result means the member has paid ahead (credit / advance).
    """
    return subtract(final_amount, amount_paid)


def format_inr(value) -> str:
    """Format as Indian currency: 1000 -> Rs.1,000 ; 125000 -> Rs.1,25,000."""
    amount = money(value, allow_negative=True)
    negative = amount < ZERO
    amount = abs(amount)

    whole, _, frac = f"{amount:.2f}".partition(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])

    out = whole if frac == "00" else f"{whole}.{frac}"
    return f"{'-' if negative else ''}\u20b9{out}"


def money_str(value) -> str:
    """Serialize an amount the same way a Pydantic response model does.

    Endpoints that return a plain dict must use this: FastAPI would otherwise
    encode a Decimal as a float, so the frontend would see 24700.0 on one
    endpoint and "24700.00" on another.
    """
    return str(money(value, allow_negative=True))
