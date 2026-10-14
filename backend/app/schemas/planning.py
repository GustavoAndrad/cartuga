from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.schemas.dashboard import NavigableRangeOut
from app.schemas.entry import EntryOut
from app.schemas.expense import ExpenseOut


class PendingEntryItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entry: EntryOut
    review_date: date
    # Set only for a FIXED entry's specific monthly occurrence - null for EXCEPTIONAL.
    occurrence_year: int | None
    occurrence_month: int | None


class PendingExpenseItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    expense: ExpenseOut
    review_date: date
    occurrence_year: int | None
    occurrence_month: int | None


class PendingReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entries: list[PendingEntryItemOut]
    expenses: list[PendingExpenseItemOut]


class PlannedComparisonPointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    year: int
    month: int
    entries_total: Decimal
    planned_entries_total: Decimal
    expenses_total: Decimal
    planned_expenses_total: Decimal
    cumulative_with_planned: Decimal
    cumulative_without_planned: Decimal
    is_projected: bool


class PlannedComparisonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    has_planned: bool
    points: list[PlannedComparisonPointOut]
    navigable_range: NavigableRangeOut
