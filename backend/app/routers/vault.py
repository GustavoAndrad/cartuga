from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.schemas.vault import (
    CarveableEntryOut,
    VaultSummaryOut,
    VaultTransactionCreate,
    VaultTransactionOut,
)
from app.services import vault_service

router = APIRouter(prefix="/vault", tags=["vault"])


@router.get("/summary", response_model=VaultSummaryOut)
def get_vault_summary(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return vault_service.get_vault_summary(db, current_user.id)


@router.get("/transactions", response_model=list[VaultTransactionOut])
def list_vault_transactions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return vault_service.list_vault_transactions(db, current_user.id)


@router.post("/transactions", response_model=VaultTransactionOut, status_code=201)
def create_vault_transaction(
    payload: VaultTransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return vault_service.create_vault_transaction(db, current_user.id, payload)


@router.delete("/transactions/{transaction_id}", status_code=204)
def delete_vault_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    vault_service.delete_vault_transaction(db, current_user.id, transaction_id)


@router.get("/carveable-entries", response_model=list[CarveableEntryOut])
def list_carveable_entries(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return vault_service.list_carveable_entries(db, current_user.id)
