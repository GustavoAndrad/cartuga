"""'Planejado' review workflow: a speculative/estimated entry or expense the user
hasn't confirmed yet - it still counts normally in every calculation (dashboard,
"Ver Impacto", everything), this module only tracks which ones are still awaiting a
decision (Confirmar/Recusar) and computes the "com vs. sem planejados" comparison."""

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.models.enums import RecurrenceType
from app.models.expense import Expense
from app.repositories import entry_occurrence_review_repository, expense_occurrence_review_repository
from app.services import finance_engine as fe
from app.utils.errors import ValidationAppError

# A planned record enters the review queue starting the day before its own date (an
# early heads-up) and stays there - overdue or not - until the user resolves it
# (Confirmar/Recusar). It never leaves the queue on its own just because the date
# passed; only an explicit Confirmar/Recusar does.
REVIEW_LOOKAHEAD_DAYS = 1


@dataclass
class PendingEntryItem:
    entry: Entry
    # The date this item is sorted/grouped by: the record's own `date` for an
    # EXCEPTIONAL entry, or the 1st of the occurrence's month for a FIXED one.
    review_date: date
    # None for EXCEPTIONAL - set for a FIXED entry's specific monthly occurrence, so
    # Confirmar/Recusar know which month to act on (see entries.confirm_entry_occurrence).
    occurrence_year: int | None = None
    occurrence_month: int | None = None


@dataclass
class PendingExpenseItem:
    expense: Expense
    review_date: date
    occurrence_year: int | None = None
    occurrence_month: int | None = None


@dataclass
class PendingReview:
    entries: list[PendingEntryItem] = field(default_factory=list)
    expenses: list[PendingExpenseItem] = field(default_factory=list)


def _review_threshold() -> date:
    return date.today() + timedelta(days=REVIEW_LOOKAHEAD_DAYS)


def _occurrence_start(is_planned_since: date, start_date: date) -> tuple[int, int]:
    """First (year, month) to check for an unreviewed occurrence: whichever of the
    rule's own start_date or its is_planned_since anchor comes later - a rule that
    hasn't started yet has no occurrence to review, regardless of how long it's been
    flagged Planejado."""
    since_idx = fe.month_index(is_planned_since.year, is_planned_since.month)
    start_idx = fe.month_index(start_date.year, start_date.month)
    return (is_planned_since.year, is_planned_since.month) if since_idx >= start_idx else (start_date.year, start_date.month)


def _occurrence_end(is_planned_since: date, end_date: date | None, threshold: date) -> tuple[int, int]:
    """Last (year, month) to check for an unreviewed occurrence: the lookahead
    threshold's month, capped at the rule's own end_date if it ends sooner."""
    to_year, to_month = threshold.year, threshold.month
    if end_date is not None and fe.month_index(end_date.year, end_date.month) < fe.month_index(to_year, to_month):
        return end_date.year, end_date.month
    return to_year, to_month


def _pending_fixed_entry_occurrences(db: Session, user_id: int, threshold: date) -> list[PendingEntryItem]:
    fixed_planned = (
        db.query(Entry)
        .filter(Entry.user_id == user_id, Entry.is_planned.is_(True), Entry.type == RecurrenceType.FIXED)
        .all()
    )
    items: list[PendingEntryItem] = []
    for entry in fixed_planned:
        if entry.is_planned_since is None:
            continue
        from_year, from_month = _occurrence_start(entry.is_planned_since, entry.start_date)
        to_year, to_month = _occurrence_end(entry.is_planned_since, entry.end_date, threshold)
        reviewed = {(r.year, r.month) for r in entry_occurrence_review_repository.list_for_entry(db, entry.id)}
        for y, m in fe.iterate_months(from_year, from_month, to_year, to_month):
            if (y, m) not in reviewed:
                items.append(
                    PendingEntryItem(entry=entry, review_date=date(y, m, 1), occurrence_year=y, occurrence_month=m)
                )
    return items


def _pending_fixed_expense_occurrences(db: Session, user_id: int, threshold: date) -> list[PendingExpenseItem]:
    fixed_planned = (
        db.query(Expense)
        .filter(Expense.user_id == user_id, Expense.is_planned.is_(True), Expense.type == RecurrenceType.FIXED)
        .all()
    )
    items: list[PendingExpenseItem] = []
    for expense in fixed_planned:
        if expense.is_planned_since is None:
            continue
        from_year, from_month = _occurrence_start(expense.is_planned_since, expense.start_date)
        to_year, to_month = _occurrence_end(expense.is_planned_since, expense.end_date, threshold)
        reviewed = {(r.year, r.month) for r in expense_occurrence_review_repository.list_for_expense(db, expense.id)}
        for y, m in fe.iterate_months(from_year, from_month, to_year, to_month):
            if (y, m) not in reviewed:
                items.append(
                    PendingExpenseItem(
                        expense=expense, review_date=date(y, m, 1), occurrence_year=y, occurrence_month=m
                    )
                )
    return items


def list_pending_review(db: Session, user_id: int) -> PendingReview:
    threshold = _review_threshold()

    exceptional_entries = (
        db.query(Entry)
        .filter(
            Entry.user_id == user_id,
            Entry.is_planned.is_(True),
            Entry.type == RecurrenceType.EXCEPTIONAL,
            Entry.date <= threshold,
        )
        .all()
    )
    entry_items = [PendingEntryItem(entry=e, review_date=e.date) for e in exceptional_entries]
    entry_items.extend(_pending_fixed_entry_occurrences(db, user_id, threshold))
    entry_items.sort(key=lambda item: item.review_date)

    exceptional_expenses = (
        db.query(Expense)
        .filter(
            Expense.user_id == user_id,
            Expense.is_planned.is_(True),
            Expense.type == RecurrenceType.EXCEPTIONAL,
            Expense.date <= threshold,
        )
        .all()
    )
    expense_items = [PendingExpenseItem(expense=e, review_date=e.date) for e in exceptional_expenses]
    expense_items.extend(_pending_fixed_expense_occurrences(db, user_id, threshold))
    expense_items.sort(key=lambda item: item.review_date)

    return PendingReview(entries=entry_items, expenses=expense_items)


def has_any_planned(db: Session, user_id: int) -> bool:
    return (
        db.query(Entry).filter(Entry.user_id == user_id, Entry.is_planned.is_(True)).first() is not None
        or db.query(Expense).filter(Expense.user_id == user_id, Expense.is_planned.is_(True)).first() is not None
    )


ZERO = Decimal("0")


@dataclass
class PlannedComparisonPoint:
    year: int
    month: int
    # That month's totals, and how much of each is the planned (not yet confirmed)
    # portion - e.g. entries_total=1500, planned_entries_total=500 means 1000 of it is
    # already-real income and 500 is still an estimate.
    entries_total: Decimal
    planned_entries_total: Decimal
    expenses_total: Decimal
    planned_expenses_total: Decimal
    cumulative_with_planned: Decimal
    cumulative_without_planned: Decimal
    is_projected: bool


@dataclass
class PlannedComparison:
    has_planned: bool
    points: list[PlannedComparisonPoint] = field(default_factory=list)
    navigable_range: fe.NavigableRange | None = None


def _shift_back(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def get_planned_comparison_for_range(
    db: Session, user_id: int, history_months: int = 6, projection_months: int = 6
) -> PlannedComparison:
    """Same history/projection window shape as GET /dashboard, for consistency with
    the rest of the app's month-range controls."""
    today = date.today()
    from_year, from_month = today.year, today.month
    for _ in range(history_months):
        from_year, from_month = _shift_back(from_year, from_month)

    _, _, to_year, to_month = fe.default_projection_range(projection_months)

    return get_planned_comparison(db, user_id, from_year, from_month, to_year, to_month)


def get_planned_comparison_window(
    db: Session, user_id: int, from_year: int, from_month: int, months: int
) -> PlannedComparison:
    """An arbitrary `months`-long window - used when a Planejamentos chart is scrolled
    away from its default window. Same horizon guard as dashboard_service.get_series_window."""
    today = date.today()
    to_year, to_month = fe.shift_month(from_year, from_month, months - 1)
    horizon = fe.shift_month(today.year, today.month, fe.MAX_HORIZON_MONTHS)
    if fe.month_index(to_year, to_month) > fe.month_index(*horizon):
        raise ValidationAppError(
            f"O período pedido passa do limite de projeção ({fe.MAX_HORIZON_MONTHS} meses à frente)."
        )
    return get_planned_comparison(db, user_id, from_year, from_month, to_year, to_month)


def get_planned_comparison(
    db: Session,
    user_id: int,
    from_year: int,
    from_month: int,
    to_year: int,
    to_month: int,
) -> PlannedComparison:
    with_series = fe.get_balance_series(db, user_id, from_year, from_month, to_year, to_month)
    without_series = fe.get_balance_series(
        db, user_id, from_year, from_month, to_year, to_month, exclude_planned=True
    )
    without_by_month = {(p.year, p.month): p for p in without_series}

    points = []
    for w in with_series:
        without_point = without_by_month.get((w.year, w.month))

        entries = fe.get_applicable_entries(db, user_id, w.year, w.month)
        direct_expenses = fe.get_applicable_direct_expenses(db, user_id, w.year, w.month)
        planned_entries_total = sum((e.amount for e in entries if e.is_planned), ZERO)
        planned_expenses_total = sum((e.amount for e in direct_expenses if e.is_planned), ZERO)

        points.append(
            PlannedComparisonPoint(
                year=w.year,
                month=w.month,
                entries_total=w.entries_total,
                planned_entries_total=planned_entries_total,
                expenses_total=w.expenses_total,
                planned_expenses_total=planned_expenses_total,
                cumulative_with_planned=w.cumulative_balance,
                cumulative_without_planned=without_point.cumulative_balance if without_point else w.cumulative_balance,
                is_projected=w.is_projected,
            )
        )

    return PlannedComparison(
        has_planned=has_any_planned(db, user_id),
        points=points,
        navigable_range=fe.get_navigable_range(db, user_id),
    )
