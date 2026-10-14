from sqlalchemy.orm import Session

from app.models.enums import OccurrenceReviewStatus
from app.models.expense_occurrence_review import ExpenseOccurrenceReview


def get(db: Session, expense_id: int, year: int, month: int) -> ExpenseOccurrenceReview | None:
    return (
        db.query(ExpenseOccurrenceReview)
        .filter(
            ExpenseOccurrenceReview.expense_id == expense_id,
            ExpenseOccurrenceReview.year == year,
            ExpenseOccurrenceReview.month == month,
        )
        .first()
    )


def list_for_expense(db: Session, expense_id: int) -> list[ExpenseOccurrenceReview]:
    return db.query(ExpenseOccurrenceReview).filter(ExpenseOccurrenceReview.expense_id == expense_id).all()


def list_for_expenses(db: Session, expense_ids: list[int], year: int, month: int) -> list[ExpenseOccurrenceReview]:
    """See entry_occurrence_review_repository.list_for_entries - same bulk lookup."""
    if not expense_ids:
        return []
    return (
        db.query(ExpenseOccurrenceReview)
        .filter(
            ExpenseOccurrenceReview.expense_id.in_(expense_ids),
            ExpenseOccurrenceReview.year == year,
            ExpenseOccurrenceReview.month == month,
        )
        .all()
    )


def upsert(
    db: Session, expense_id: int, year: int, month: int, status: OccurrenceReviewStatus, override_amount=None
) -> ExpenseOccurrenceReview:
    review = get(db, expense_id, year, month)
    if review is None:
        review = ExpenseOccurrenceReview(
            expense_id=expense_id, year=year, month=month, status=status, override_amount=override_amount
        )
        db.add(review)
    else:
        review.status = status
        review.override_amount = override_amount
    db.commit()
    db.refresh(review)
    return review
