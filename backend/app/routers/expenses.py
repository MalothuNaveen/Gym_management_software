"""Expenses: a simple spend log, not an accounting system."""
from datetime import date

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession, gym_today
from app.errors import NotFound
from app.models import Expense
from app.schemas.common import MessageOut, Page, paginate
from app.schemas.finance import ExpenseIn, ExpenseOut
from app.services.money import money, money_str

router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.get("", response_model=Page[ExpenseOut])
def list_expenses(
    user: CurrentUser,
    db: DbSession,
    category: str | None = None,
    start: date | None = None,
    end: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    stmt = select(Expense).where(Expense.gym_id == user.gym_id)
    if category:
        stmt = stmt.where(Expense.category == category)
    if start:
        stmt = stmt.where(Expense.expense_date >= start)
    if end:
        stmt = stmt.where(Expense.expense_date <= end)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.scalars(
            stmt.order_by(Expense.expense_date.desc(), Expense.id.desc())
            .offset((page - 1) * page_size).limit(page_size)
        )
    )
    return paginate([ExpenseOut.model_validate(e) for e in rows], total, page,
                    page_size)


@router.get("/summary")
def expense_summary(user: CurrentUser, db: DbSession,
                    start: date | None = None, end: date | None = None):
    """Totals per category for the period - what the expense page shows on top."""
    gym_id = user.gym_id
    today = gym_today(db, gym_id)
    start = start or today.replace(day=1)
    end = end or today

    rows = db.execute(
        select(Expense.category, func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.gym_id == gym_id, Expense.expense_date >= start,
               Expense.expense_date <= end)
        .group_by(Expense.category)
        .order_by(func.sum(Expense.amount).desc())
    ).all()

    total = sum((money(a) for _, a in rows), money(0))
    return {
        "start": start,
        "end": end,
        "total": money_str(total),
        "by_category": [{"category": c, "amount": money_str(a)} for c, a in rows],
    }


@router.post("", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(payload: ExpenseIn, user: CurrentUser, db: DbSession):
    expense = Expense(gym_id=user.gym_id, created_by_user_id=user.id,
                      **payload.model_dump())
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.put("/{expense_id}", response_model=ExpenseOut)
def update_expense(expense_id: int, payload: ExpenseIn, user: CurrentUser,
                   db: DbSession):
    expense = db.get(Expense, expense_id)
    if not expense or expense.gym_id != user.gym_id:
        raise NotFound("expense")
    for field, value in payload.model_dump().items():
        setattr(expense, field, value)
    db.commit()
    db.refresh(expense)
    return expense


@router.delete("/{expense_id}", response_model=MessageOut)
def delete_expense(expense_id: int, user: CurrentUser, db: DbSession):
    """Expenses are the one record that can be removed - they are the owner's
    own notes, not a member-facing financial document."""
    expense = db.get(Expense, expense_id)
    if not expense or expense.gym_id != user.gym_id:
        raise NotFound("expense")
    db.delete(expense)
    db.commit()
    return MessageOut(message="Expense removed.")
