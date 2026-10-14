from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.schemas.dashboard import DashboardOut, MonthDetailOut, MonthPointOut
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def get_dashboard(
    history_months: int = Query(6, ge=0, le=60),
    projection_months: int = Query(6, ge=0, le=60),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return dashboard_service.build_dashboard(db, current_user.id, history_months, projection_months)


@router.get("/series", response_model=list[MonthPointOut])
def get_series_window(
    from_year: int = Query(..., ge=1900, le=3000),
    from_month: int = Query(..., ge=1, le=12),
    months: int = Query(..., ge=1, le=121),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """`months` consecutive months starting at from_year/from_month - the same points
    as GET /dashboard's time_series, for a chart scrolled to another window."""
    return dashboard_service.get_series_window(db, current_user.id, from_year, from_month, months)


@router.get("/month/{year}/{month}", response_model=MonthDetailOut)
def get_month_detail(
    year: int = Path(..., ge=1900, le=3000),
    month: int = Path(..., ge=1, le=12),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return dashboard_service.build_month_detail(db, current_user.id, year, month)
