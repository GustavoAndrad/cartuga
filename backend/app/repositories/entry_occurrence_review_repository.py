from sqlalchemy.orm import Session

from app.models.entry_occurrence_review import EntryOccurrenceReview
from app.models.enums import OccurrenceReviewStatus


def get(db: Session, entry_id: int, year: int, month: int) -> EntryOccurrenceReview | None:
    return (
        db.query(EntryOccurrenceReview)
        .filter(
            EntryOccurrenceReview.entry_id == entry_id,
            EntryOccurrenceReview.year == year,
            EntryOccurrenceReview.month == month,
        )
        .first()
    )


def list_for_entry(db: Session, entry_id: int) -> list[EntryOccurrenceReview]:
    return db.query(EntryOccurrenceReview).filter(EntryOccurrenceReview.entry_id == entry_id).all()


def list_for_entries(db: Session, entry_ids: list[int], year: int, month: int) -> list[EntryOccurrenceReview]:
    """Bulk lookup for a single (year, month) across several entries - used by
    finance_engine to resolve every FIXED+Planejado entry's occurrence for a month in
    one query instead of one per entry."""
    if not entry_ids:
        return []
    return (
        db.query(EntryOccurrenceReview)
        .filter(
            EntryOccurrenceReview.entry_id.in_(entry_ids),
            EntryOccurrenceReview.year == year,
            EntryOccurrenceReview.month == month,
        )
        .all()
    )


def upsert(
    db: Session, entry_id: int, year: int, month: int, status: OccurrenceReviewStatus, override_amount=None
) -> EntryOccurrenceReview:
    review = get(db, entry_id, year, month)
    if review is None:
        review = EntryOccurrenceReview(entry_id=entry_id, year=year, month=month, status=status, override_amount=override_amount)
        db.add(review)
    else:
        review.status = status
        review.override_amount = override_amount
    db.commit()
    db.refresh(review)
    return review
