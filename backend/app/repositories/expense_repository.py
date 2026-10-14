from sqlalchemy.orm import Session, joinedload

from app.models.expense import Expense
from app.models.installment import Installment


def get(db: Session, user_id: int, expense_id: int) -> Expense | None:
    return (
        db.query(Expense)
        .options(joinedload(Expense.installments).joinedload(Installment.adjustments))
        .filter(Expense.id == expense_id, Expense.user_id == user_id)
        .first()
    )


def list_all(db: Session, user_id: int) -> list[Expense]:
    return (
        db.query(Expense)
        .options(joinedload(Expense.installments).joinedload(Installment.adjustments))
        .filter(Expense.user_id == user_id)
        .order_by(Expense.date.desc())
        .all()
    )


def create(db: Session, expense: Expense) -> Expense:
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


def delete(db: Session, expense: Expense) -> None:
    db.delete(expense)
    db.commit()
