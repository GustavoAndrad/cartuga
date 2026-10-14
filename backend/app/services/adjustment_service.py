from datetime import date

from sqlalchemy.orm import Session

from app.models.installment import Installment
from app.models.installment_adjustment import InstallmentAdjustment
from app.repositories import installment_repository
from app.schemas.installment import InstallmentAdjustmentCreate
from app.services import finance_engine as fe
from app.utils.errors import NotFoundError, ValidationAppError


def get_installment(db: Session, user_id: int, installment_id: int) -> Installment:
    installment = installment_repository.get(db, user_id, installment_id)
    if installment is None:
        raise NotFoundError("Parcela não encontrada.")
    return installment


def advance_installment(db: Session, user_id: int, installment_id: int) -> Installment:
    """Marks a future installment as paid early, moving it (for accounting purposes -
    see finance_engine.installment_effective_month_index) into the current month.
    due_date itself is never touched, so this can always be undone via
    unadvance_installment.

    Installments of the same purchase must be advanced in order - you can't advance
    March while February is still sitting un-advanced, since "I paid ahead" only makes
    sense as "I paid everything up to this point ahead", not a scattered pick of future
    months."""
    installment = get_installment(db, user_id, installment_id)
    if installment.advanced_to_year is not None:
        raise ValidationAppError("Esta parcela já está antecipada.")

    today = date.today()
    due_idx = fe.month_index(installment.due_date.year, installment.due_date.month)
    current_idx = fe.month_index(today.year, today.month)
    if due_idx <= current_idx:
        raise ValidationAppError("Só é possível antecipar parcelas de meses futuros.")

    siblings = installment_repository.list_for_expense(db, user_id, installment.expense_id)
    earlier_pending = [
        s
        for s in siblings
        if s.installment_number < installment.installment_number
        and s.advanced_to_year is None
        and fe.month_index(s.due_date.year, s.due_date.month) > current_idx
    ]
    if earlier_pending:
        first_pending = min(earlier_pending, key=lambda s: s.installment_number)
        raise ValidationAppError(
            f"Antecipe as parcelas em ordem: a parcela {first_pending.installment_number} "
            "precisa ser antecipada antes desta."
        )

    installment.advanced_to_year = today.year
    installment.advanced_to_month = today.month
    db.commit()
    db.refresh(installment)
    return installment


def unadvance_installment(db: Session, user_id: int, installment_id: int) -> Installment:
    """Undoing must also happen in order (highest installment_number first), so the
    set of advanced installments for a purchase never has a gap in the middle - the
    same invariant advance_installment enforces going forward."""
    installment = get_installment(db, user_id, installment_id)
    if installment.advanced_to_year is None:
        raise ValidationAppError("Esta parcela não está antecipada.")

    siblings = installment_repository.list_for_expense(db, user_id, installment.expense_id)
    later_advanced = [
        s
        for s in siblings
        if s.installment_number > installment.installment_number and s.advanced_to_year is not None
    ]
    if later_advanced:
        last_advanced = max(later_advanced, key=lambda s: s.installment_number)
        raise ValidationAppError(
            f"Desfaça as antecipações em ordem: a parcela {last_advanced.installment_number} "
            "precisa ser desfeita antes desta."
        )

    installment.advanced_to_year = None
    installment.advanced_to_month = None
    db.commit()
    db.refresh(installment)
    return installment


def add_adjustment(
    db: Session, user_id: int, installment_id: int, payload: InstallmentAdjustmentCreate
) -> InstallmentAdjustment:
    installment = get_installment(db, user_id, installment_id)
    adjustment = InstallmentAdjustment(
        installment_id=installment.id, amount=payload.amount, description=payload.description
    )
    return installment_repository.add_adjustment(db, installment, adjustment)


def delete_adjustment(db: Session, user_id: int, installment_id: int, adjustment_id: int) -> None:
    get_installment(db, user_id, installment_id)  # ownership check
    adjustment = installment_repository.get_adjustment(db, installment_id, adjustment_id)
    if adjustment is None:
        raise NotFoundError("Ajuste não encontrado.")
    installment_repository.delete_adjustment(db, adjustment)
