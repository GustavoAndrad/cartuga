from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.repositories import installment_repository
from app.schemas.expense import ExpenseCreate, ExpenseOut, ExpenseUpdate
from app.schemas.impact import ImpactOut
from app.schemas.installment import InstallmentOut
from app.schemas.occurrence_review import OccurrenceConfirmIn, OccurrenceReviewOut
from app.services import expense_service, impact_service

router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.get("", response_model=list[ExpenseOut])
def list_expenses(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return expense_service.list_expenses(db, current_user.id)


@router.post("", response_model=ExpenseOut, status_code=201)
def create_expense(
    payload: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return expense_service.create_expense(db, current_user.id, payload)


@router.get("/{expense_id}", response_model=ExpenseOut)
def get_expense(
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return expense_service.get_expense(db, current_user.id, expense_id)


@router.put("/{expense_id}", response_model=ExpenseOut)
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return expense_service.update_expense(db, current_user.id, expense_id, payload)


@router.delete("/{expense_id}", status_code=204)
def delete_expense(
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    expense_service.delete_expense(db, current_user.id, expense_id)


@router.get("/{expense_id}/impact", response_model=ImpactOut)
def get_expense_impact(
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return impact_service.get_expense_impact(db, current_user.id, expense_id)


@router.get("/{expense_id}/installments", response_model=list[InstallmentOut])
def list_expense_installments(
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    expense_service.get_expense(db, current_user.id, expense_id)  # ownership check
    return installment_repository.list_for_expense(db, current_user.id, expense_id)


@router.post("/{expense_id}/occurrences/{year}/{month}/confirm", response_model=OccurrenceReviewOut)
def confirm_expense_occurrence(
    expense_id: int,
    year: int,
    month: int,
    payload: OccurrenceConfirmIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """See entries.confirm_entry_occurrence - same per-month confirm for a FIXED +
    Planejado expense."""
    return expense_service.confirm_expense_occurrence(db, current_user.id, expense_id, year, month, payload.amount)


@router.post("/{expense_id}/occurrences/{year}/{month}/reject", response_model=OccurrenceReviewOut)
def reject_expense_occurrence(
    expense_id: int,
    year: int,
    month: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """See entries.reject_entry_occurrence - same per-month reject for a FIXED +
    Planejado expense."""
    return expense_service.reject_expense_occurrence(db, current_user.id, expense_id, year, month)
