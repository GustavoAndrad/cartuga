from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.schemas.installment import InstallmentAdjustmentCreate, InstallmentAdjustmentOut, InstallmentOut
from app.services import adjustment_service

router = APIRouter(prefix="/installments", tags=["installments"])


@router.get("/{installment_id}", response_model=InstallmentOut)
def get_installment(
    installment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return adjustment_service.get_installment(db, current_user.id, installment_id)


@router.post("/{installment_id}/adjustments", response_model=InstallmentAdjustmentOut, status_code=201)
def add_adjustment(
    installment_id: int,
    payload: InstallmentAdjustmentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return adjustment_service.add_adjustment(db, current_user.id, installment_id, payload)


@router.delete("/{installment_id}/adjustments/{adjustment_id}", status_code=204)
def delete_adjustment(
    installment_id: int,
    adjustment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    adjustment_service.delete_adjustment(db, current_user.id, installment_id, adjustment_id)


@router.post("/{installment_id}/advance", response_model=InstallmentOut)
def advance_installment(
    installment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return adjustment_service.advance_installment(db, current_user.id, installment_id)


@router.post("/{installment_id}/unadvance", response_model=InstallmentOut)
def unadvance_installment(
    installment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return adjustment_service.unadvance_installment(db, current_user.id, installment_id)
