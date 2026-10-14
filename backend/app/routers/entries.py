from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.schemas.entry import EntryCreate, EntryOut, EntryUpdate
from app.schemas.impact import ImpactOut
from app.schemas.occurrence_review import OccurrenceConfirmIn, OccurrenceReviewOut
from app.services import entry_service, impact_service

router = APIRouter(prefix="/entries", tags=["entries"])


@router.get("", response_model=list[EntryOut])
def list_entries(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return entry_service.list_entries(db, current_user.id)


@router.post("", response_model=EntryOut, status_code=201)
def create_entry(
    payload: EntryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return entry_service.create_entry(db, current_user.id, payload)


@router.get("/{entry_id}", response_model=EntryOut)
def get_entry(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return entry_service.get_entry(db, current_user.id, entry_id)


@router.put("/{entry_id}", response_model=EntryOut)
def update_entry(
    entry_id: int,
    payload: EntryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return entry_service.update_entry(db, current_user.id, entry_id, payload)


@router.delete("/{entry_id}", status_code=204)
def delete_entry(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry_service.delete_entry(db, current_user.id, entry_id)


@router.get("/{entry_id}/impact", response_model=ImpactOut)
def get_entry_impact(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return impact_service.get_entry_impact(db, current_user.id, entry_id)


@router.post("/{entry_id}/occurrences/{year}/{month}/confirm", response_model=OccurrenceReviewOut)
def confirm_entry_occurrence(
    entry_id: int,
    year: int,
    month: int,
    payload: OccurrenceConfirmIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Confirms a single month's occurrence of a FIXED + Planejado entry - optionally
    with a value that differs from the rule's own amount, just for this month."""
    return entry_service.confirm_entry_occurrence(db, current_user.id, entry_id, year, month, payload.amount)


@router.post("/{entry_id}/occurrences/{year}/{month}/reject", response_model=OccurrenceReviewOut)
def reject_entry_occurrence(
    entry_id: int,
    year: int,
    month: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rejects a single month's occurrence of a FIXED + Planejado entry - that month
    stops counting in every calculation, every other month of the rule is unaffected."""
    return entry_service.reject_entry_occurrence(db, current_user.id, entry_id, year, month)
