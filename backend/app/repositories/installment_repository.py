from sqlalchemy.orm import Session, joinedload

from app.models.expense import Expense
from app.models.installment import Installment
from app.models.installment_adjustment import InstallmentAdjustment


def get(db: Session, user_id: int, installment_id: int) -> Installment | None:
    return (
        db.query(Installment)
        .join(Expense, Installment.expense_id == Expense.id)
        .options(joinedload(Installment.adjustments))
        .filter(Installment.id == installment_id, Expense.user_id == user_id)
        .first()
    )


def list_for_expense(db: Session, user_id: int, expense_id: int) -> list[Installment]:
    return (
        db.query(Installment)
        .join(Expense, Installment.expense_id == Expense.id)
        .options(joinedload(Installment.adjustments))
        .filter(Installment.expense_id == expense_id, Expense.user_id == user_id)
        .order_by(Installment.installment_number)
        .all()
    )


def add_adjustment(db: Session, installment: Installment, adjustment: InstallmentAdjustment) -> InstallmentAdjustment:
    adjustment.installment_id = installment.id
    db.add(adjustment)
    db.commit()
    db.refresh(adjustment)
    return adjustment


def get_adjustment(db: Session, installment_id: int, adjustment_id: int) -> InstallmentAdjustment | None:
    return (
        db.query(InstallmentAdjustment)
        .filter(
            InstallmentAdjustment.id == adjustment_id,
            InstallmentAdjustment.installment_id == installment_id,
        )
        .first()
    )


def delete_adjustment(db: Session, adjustment: InstallmentAdjustment) -> None:
    db.delete(adjustment)
    db.commit()
