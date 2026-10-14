from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.schemas.planning import PendingReviewOut, PlannedComparisonOut
from app.services import planning_service

router = APIRouter(prefix="/planning", tags=["planning"])


@router.get("/pending", response_model=PendingReviewOut)
def get_pending_review(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return planning_service.list_pending_review(db, current_user.id)


@router.get("/comparison", response_model=PlannedComparisonOut)
def get_planned_comparison(
    history_months: int = Query(6, ge=0, le=60),
    projection_months: int = Query(6, ge=0, le=60),
    from_year: int | None = Query(None, ge=1900, le=3000),
    from_month: int | None = Query(None, ge=1, le=12),
    months: int | None = Query(None, ge=1, le=121),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Default window: `history_months` back + current + `projection_months` ahead.
    With from_year/from_month/months, any other window instead (a scrolled chart)."""
    if from_year is not None and from_month is not None and months is not None:
        return planning_service.get_planned_comparison_window(db, current_user.id, from_year, from_month, months)
    return planning_service.get_planned_comparison_for_range(db, current_user.id, history_months, projection_months)
