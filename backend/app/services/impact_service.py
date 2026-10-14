""""Ver Impacto": how much a single entry/expense actually moves the monthly and
cumulative balance, from the month it first applies through either its own end (if
any) or the app's own maximum projection horizon (spec: understand *until when* a
record keeps being computed, and its *real* effect on balance values - a FIXED record
with no end date should never render as an unbounded chart).

The core idea is a counterfactual: recompute the exact same balance series finance_engine
already produces for the dashboard, once with the record and once with it excluded
(finance_engine.get_balance_series(..., exclude_entry_id=/exclude_expense_id=)). The
difference between the two cumulative lines at any month *is* the record's cumulative
impact - this can never drift from what the dashboard itself shows, since it's the same
calculation with one fewer record."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.models.enums import PaymentMethod, RecurrenceType
from app.models.expense import Expense
from app.services import entry_service, expense_service
from app.services import finance_engine as fe
from app.utils.errors import ValidationAppError

ZERO = Decimal("0")
# An indefinite (no end_date) FIXED record's impact is capped at the app-wide
# projection horizon rather than rendered as an unbounded chart.
MAX_HORIZON_MONTHS = fe.MAX_HORIZON_MONTHS

MonthTuple = tuple[int, int]


def _advance_months(year: int, month: int, n: int) -> MonthTuple:
    idx = fe.month_index(year, month) + n
    y, m = divmod(idx - 1, 12)
    return y, m + 1


@dataclass
class ImpactPoint:
    year: int
    month: int
    direct_amount: Decimal
    cumulative_with: Decimal
    cumulative_without: Decimal
    cumulative_impact: Decimal
    is_projected: bool


@dataclass
class ImpactResult:
    active_from_year: int
    active_from_month: int
    active_until_year: int | None
    active_until_month: int | None
    is_indefinite: bool
    horizon_year: int
    horizon_month: int
    points: list[ImpactPoint] = field(default_factory=list)


def _entry_active_range(entry: Entry) -> tuple[MonthTuple, MonthTuple | None]:
    if entry.type == RecurrenceType.EXCEPTIONAL:
        start = (entry.date.year, entry.date.month)
        return start, start
    start = (entry.start_date.year, entry.start_date.month)
    end = (entry.end_date.year, entry.end_date.month) if entry.end_date else None
    return start, end


def _direct_expense_active_range(expense: Expense) -> tuple[MonthTuple, MonthTuple | None]:
    if expense.type == RecurrenceType.EXCEPTIONAL:
        start = (expense.date.year, expense.date.month)
        return start, start
    start = (expense.start_date.year, expense.start_date.month)
    end = (expense.end_date.year, expense.end_date.month) if expense.end_date else None
    return start, end


def _credit_expense_active_range(expense: Expense) -> tuple[MonthTuple, MonthTuple]:
    """A CREDITO purchase is always type=EXCEPTIONAL (see ExpenseCreate validation),
    but it applies across every one of its installments' effective months - never
    indefinite, since the installment count is fixed (1-24) at creation time."""
    indices = [fe.installment_effective_month_index(i) for i in expense.installments]
    start_y, start_m = divmod(min(indices) - 1, 12)
    end_y, end_m = divmod(max(indices) - 1, 12)
    return (start_y, start_m + 1), (end_y, end_m + 1)


def _resolve_display_range(
    start: MonthTuple, end: MonthTuple | None, is_indefinite: bool
) -> tuple[MonthTuple, MonthTuple]:
    """The chart's end month: the app's max projection horizon, extended past a
    record's own (earlier) end so the "impact never fully disappears, it just stops
    growing" plateau after it stops actively contributing is visible - or the horizon
    itself when the record is indefinite."""
    today = date.today()
    horizon = _advance_months(today.year, today.month, MAX_HORIZON_MONTHS)

    display_end = horizon if (is_indefinite or end is None) else end
    if fe.month_index(*display_end) < fe.month_index(*horizon):
        display_end = horizon
    if fe.month_index(*display_end) < fe.month_index(*start):
        display_end = start
    return start, display_end


def _combine(with_series, without_series) -> list[ImpactPoint]:
    without_by_month = {(p.year, p.month): p for p in without_series}
    points = []
    for w in with_series:
        wo = without_by_month.get((w.year, w.month))
        wo_balance = wo.balance if wo else ZERO
        wo_cumulative = wo.cumulative_balance if wo else ZERO
        points.append(
            ImpactPoint(
                year=w.year,
                month=w.month,
                direct_amount=w.balance - wo_balance,
                cumulative_with=w.cumulative_balance,
                cumulative_without=wo_cumulative,
                cumulative_impact=w.cumulative_balance - wo_cumulative,
                is_projected=w.is_projected,
            )
        )
    return points


def get_entry_impact(db: Session, user_id: int, entry_id: int) -> ImpactResult:
    entry = entry_service.get_entry(db, user_id, entry_id)
    if not entry.counts_toward_dashboard:
        raise ValidationAppError(
            "Esta entrada não conta para o dashboard (veio do Cofre), então não tem "
            "impacto no saldo."
        )

    start, end = _entry_active_range(entry)
    is_indefinite = entry.type == RecurrenceType.FIXED and end is None
    start, display_end = _resolve_display_range(start, end, is_indefinite)

    with_series = fe.get_balance_series(db, user_id, *start, *display_end)
    without_series = fe.get_balance_series(db, user_id, *start, *display_end, exclude_entry_id=entry_id)

    return ImpactResult(
        active_from_year=start[0],
        active_from_month=start[1],
        active_until_year=end[0] if end else None,
        active_until_month=end[1] if end else None,
        is_indefinite=is_indefinite,
        horizon_year=display_end[0],
        horizon_month=display_end[1],
        points=_combine(with_series, without_series),
    )


def get_expense_impact(db: Session, user_id: int, expense_id: int) -> ImpactResult:
    expense = expense_service.get_expense(db, user_id, expense_id)

    if expense.payment_method == PaymentMethod.CREDITO:
        start, end = _credit_expense_active_range(expense)
        is_indefinite = False
    else:
        start, end = _direct_expense_active_range(expense)
        is_indefinite = expense.type == RecurrenceType.FIXED and end is None

    start, display_end = _resolve_display_range(start, end, is_indefinite)

    with_series = fe.get_balance_series(db, user_id, *start, *display_end)
    without_series = fe.get_balance_series(db, user_id, *start, *display_end, exclude_expense_id=expense_id)

    return ImpactResult(
        active_from_year=start[0],
        active_from_month=start[1],
        active_until_year=end[0] if end else None,
        active_until_month=end[1] if end else None,
        is_indefinite=is_indefinite,
        horizon_year=display_end[0],
        horizon_month=display_end[1],
        points=_combine(with_series, without_series),
    )
