"""Friendly error handling.

The gym owner must never see a stack trace or a raw '500 Internal Server
Error'. Everything that reaches the browser is a plain sentence they can act on.
"""
import logging

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.services.money import MoneyError

logger = logging.getLogger("gym")


class AppError(Exception):
    """An expected, explainable problem. The message is shown to the user."""

    def __init__(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST,
                 field: str | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.field = field


class NotFound(AppError):
    def __init__(self, what: str = "record"):
        super().__init__(f"That {what} could not be found.",
                         status.HTTP_404_NOT_FOUND)


def _payload(message: str, field: str | None = None, errors: list | None = None):
    body: dict = {"message": message}
    if field:
        body["field"] = field
    if errors:
        body["errors"] = errors
    return body


# Field names as the owner sees them on screen.
FIELD_LABELS = {
    "full_name": "Full name", "phone": "Mobile number", "email": "Email",
    "amount": "Amount", "fee": "Membership fee", "discount": "Discount",
    "start_date": "Start date", "end_date": "End date", "paid_on": "Payment date",
    "password": "Password", "plan_id": "Membership plan", "member_id": "Member",
    "monthly_salary": "Monthly salary", "expense_date": "Date",
    "duration_days": "Duration", "price": "Price", "name": "Name",
}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return JSONResponse(_payload(exc.message, exc.field), exc.status_code)

    @app.exception_handler(MoneyError)
    async def _money_error(_: Request, exc: MoneyError):
        return JSONResponse(_payload(str(exc)), status.HTTP_400_BAD_REQUEST)

    @app.exception_handler(HTTPException)
    async def _http_error(_: Request, exc: HTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else "Something went wrong."
        return JSONResponse(_payload(detail), exc.status_code,
                            headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        """Turn pydantic's technical output into one readable sentence."""
        readable = []
        for err in exc.errors():
            loc = [p for p in err["loc"] if p not in ("body", "query", "path")]
            raw = str(loc[-1]) if loc else "value"
            label = FIELD_LABELS.get(raw, raw.replace("_", " ").capitalize())
            msg = err.get("msg", "is invalid")
            msg = msg.removeprefix("Value error, ")
            if msg.startswith("Field required"):
                msg = "is required"
            readable.append({"field": raw, "message": f"{label} {msg.lower()}"
                             if msg.startswith(("is ", "must ", "should "))
                             else f"{label}: {msg}"})
        first = readable[0]["message"] if readable else "Please check the form."
        return JSONResponse(
            _payload(first, readable[0]["field"] if readable else None, readable),
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    @app.exception_handler(IntegrityError)
    async def _integrity_error(_: Request, exc: IntegrityError):
        logger.warning("Integrity error: %s", exc, exc_info=False)
        text = str(getattr(exc, "orig", exc)).lower()
        if "uq_attendance_day" in text:
            msg = "This member is already marked present today."
        elif "uq_users_email" in text:
            msg = "An account with this email already exists."
        elif "uq_plan_gym_name" in text:
            msg = "A plan with this name already exists."
        elif "uq_member_gym_code" in text or "uq_receipt_gym_no" in text:
            msg = "That number was just used. Please try again."
        else:
            msg = "That record conflicts with something already saved."
        return JSONResponse(_payload(msg), status.HTTP_409_CONFLICT)

    @app.exception_handler(SQLAlchemyError)
    async def _db_error(_: Request, exc: SQLAlchemyError):
        logger.exception("Database error", exc_info=exc)
        return JSONResponse(
            _payload("We could not reach the database just now. "
                     "Please check your connection and try again."),
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception):
        logger.exception("Unhandled error", exc_info=exc)
        return JSONResponse(
            _payload("Something went wrong on our side. Please try again."),
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
