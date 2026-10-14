"""Single source of truth for every financial calculation in Cartuga.

Historical and projected months use the exact same logic here — "applicability" is
purely date-based (does this entry/expense/installment's window cover this month?),
never "has this month already happened?". The only thing that changes for a future
month is a presentational `is_projected` flag added by the dashboard layer; the
underlying numbers are computed identically either way (spec section 17).
"""

from calendar import monthrange
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.entry import Entry
from app.models.enums import OccurrenceReviewStatus, PaymentMethod, RecurrenceType
from app.models.expense import Expense
from app.models.installment import Installment
from app.repositories import entry_occurrence_review_repository, expense_occurrence_review_repository

ZERO = Decimal("0")


def month_index(year: int, month: int) -> int:
    return year * 12 + month


def installment_effective_month_index(installment: Installment) -> int:
    """The month index an installment actually counts toward: its advanced-to month if
    it's been advanced, otherwise its original due_date's month. Every reader that
    needs to know "which month does this installment belong to" - month-matching,
    epoch computation, the committed-installments total - goes through this, so
    advancing one never requires touching due_date itself."""
    if installment.advanced_to_year is not None and installment.advanced_to_month is not None:
        return month_index(installment.advanced_to_year, installment.advanced_to_month)
    return month_index(installment.due_date.year, installment.due_date.month)


def month_bounds(year: int, month: int) -> tuple[date, date]:
    last_day = monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def add_months(d: date, n: int) -> date:
    """Advances `d` by `n` calendar months, clamping the day to the target month's
    last valid day (e.g. Jan 31 + 1 month -> Feb 28/29)."""
    total = d.year * 12 + (d.month - 1) + n
    year, month = divmod(total, 12)
    month += 1
    last_day = monthrange(year, month)[1]
    return date(year, month, min(d.day, last_day))


def _next_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def iterate_months(from_year: int, from_month: int, to_year: int, to_month: int):
    y, m = from_year, from_month
    end_idx = month_index(to_year, to_month)
    while month_index(y, m) <= end_idx:
        yield y, m
        y, m = _next_month(y, m)


def _entry_applicable(entry: Entry, year: int, month: int) -> bool:
    target = month_index(year, month)
    if entry.type == RecurrenceType.EXCEPTIONAL:
        return month_index(entry.date.year, entry.date.month) == target

    start_idx = month_index(entry.start_date.year, entry.start_date.month)
    end_idx = month_index(entry.end_date.year, entry.end_date.month) if entry.end_date else None
    return start_idx <= target and (end_idx is None or target <= end_idx)


def _expense_applicable_direct(expense: Expense, year: int, month: int) -> bool:
    target = month_index(year, month)
    if expense.type == RecurrenceType.EXCEPTIONAL:
        return month_index(expense.date.year, expense.date.month) == target

    start_idx = month_index(expense.start_date.year, expense.start_date.month)
    end_idx = (
        month_index(expense.end_date.year, expense.end_date.month) if expense.end_date else None
    )
    return start_idx <= target and (end_idx is None or target <= end_idx)


def _copy_entry_with_amount(entry: Entry, amount: Decimal) -> Entry:
    """A fresh, transient Entry (never added to any session) mirroring `entry` with
    `amount` overridden for a single month's occurrence - safe to hand to callers that
    only read it (totals, serialization), since mutating the real ORM instance in place
    would risk that override leaking into the next flush/commit on this session."""
    return Entry(
        id=entry.id,
        user_id=entry.user_id,
        date=entry.date,
        amount=amount,
        currency=entry.currency,
        original_amount=entry.original_amount,
        exchange_rate=entry.exchange_rate,
        exchange_rate_date=entry.exchange_rate_date,
        description=entry.description,
        source=entry.source,
        type=entry.type,
        counts_toward_dashboard=entry.counts_toward_dashboard,
        is_planned=entry.is_planned,
        is_planned_since=entry.is_planned_since,
        start_date=entry.start_date,
        end_date=entry.end_date,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


def _copy_expense_with_amount(expense: Expense, amount: Decimal) -> Expense:
    """See _copy_entry_with_amount - same transient-copy trick for an expense."""
    return Expense(
        id=expense.id,
        user_id=expense.user_id,
        date=expense.date,
        amount=amount,
        currency=expense.currency,
        original_amount=expense.original_amount,
        exchange_rate=expense.exchange_rate,
        exchange_rate_date=expense.exchange_rate_date,
        description=expense.description,
        source=expense.source,
        type=expense.type,
        payment_method=expense.payment_method,
        is_planned=expense.is_planned,
        is_planned_since=expense.is_planned_since,
        start_date=expense.start_date,
        end_date=expense.end_date,
        created_at=expense.created_at,
        updated_at=expense.updated_at,
    )


def _apply_entry_occurrence_reviews(db: Session, entries: list[Entry], year: int, month: int) -> list[Entry]:
    """A FIXED + Planejado entry is reviewed one month at a time (see
    EntryOccurrenceReview): a REJECTED month contributes nothing, a CONFIRMED month
    with an override_amount contributes that instead of the rule's own `amount`. No
    review row yet (still pending) or an EXCEPTIONAL/non-planned entry - unaffected,
    counts exactly as it does today."""
    fixed_planned_ids = [e.id for e in entries if e.type == RecurrenceType.FIXED and e.is_planned]
    if not fixed_planned_ids:
        return entries

    reviews_by_entry = {
        r.entry_id: r
        for r in entry_occurrence_review_repository.list_for_entries(db, fixed_planned_ids, year, month)
    }
    if not reviews_by_entry:
        return entries

    result = []
    for entry in entries:
        review = reviews_by_entry.get(entry.id)
        if review is None:
            result.append(entry)
        elif review.status == OccurrenceReviewStatus.REJECTED:
            continue
        elif review.override_amount is not None:
            result.append(_copy_entry_with_amount(entry, review.override_amount))
        else:
            result.append(entry)
    return result


def _apply_expense_occurrence_reviews(db: Session, expenses: list[Expense], year: int, month: int) -> list[Expense]:
    """See _apply_entry_occurrence_reviews - same per-month review resolution for expenses."""
    fixed_planned_ids = [e.id for e in expenses if e.type == RecurrenceType.FIXED and e.is_planned]
    if not fixed_planned_ids:
        return expenses

    reviews_by_expense = {
        r.expense_id: r
        for r in expense_occurrence_review_repository.list_for_expenses(db, fixed_planned_ids, year, month)
    }
    if not reviews_by_expense:
        return expenses

    result = []
    for expense in expenses:
        review = reviews_by_expense.get(expense.id)
        if review is None:
            result.append(expense)
        elif review.status == OccurrenceReviewStatus.REJECTED:
            continue
        elif review.override_amount is not None:
            result.append(_copy_expense_with_amount(expense, review.override_amount))
        else:
            result.append(expense)
    return result


def get_applicable_entries(
    db: Session,
    user_id: int,
    year: int,
    month: int,
    *,
    exclude_entry_id: int | None = None,
    exclude_planned: bool = False,
) -> list[Entry]:
    query = db.query(Entry).filter(Entry.user_id == user_id, Entry.counts_toward_dashboard.is_(True))
    if exclude_entry_id is not None:
        query = query.filter(Entry.id != exclude_entry_id)
    if exclude_planned:
        query = query.filter(Entry.is_planned.is_(False))
    applicable = [e for e in query.all() if _entry_applicable(e, year, month)]
    return _apply_entry_occurrence_reviews(db, applicable, year, month)


def get_applicable_direct_expenses(
    db: Session,
    user_id: int,
    year: int,
    month: int,
    *,
    exclude_expense_id: int | None = None,
    exclude_planned: bool = False,
) -> list[Expense]:
    query = db.query(Expense).filter(Expense.user_id == user_id, Expense.payment_method == PaymentMethod.CONTA)
    if exclude_expense_id is not None:
        query = query.filter(Expense.id != exclude_expense_id)
    if exclude_planned:
        query = query.filter(Expense.is_planned.is_(False))
    applicable = [e for e in query.all() if _expense_applicable_direct(e, year, month)]
    return _apply_expense_occurrence_reviews(db, applicable, year, month)


def get_applicable_installments(
    db: Session, user_id: int, year: int, month: int, *, exclude_expense_id: int | None = None
) -> list[Installment]:
    target = month_index(year, month)
    query = (
        db.query(Installment)
        .join(Expense, Installment.expense_id == Expense.id)
        .filter(Expense.user_id == user_id)
        .options(joinedload(Installment.adjustments), joinedload(Installment.expense))
    )
    if exclude_expense_id is not None:
        query = query.filter(Installment.expense_id != exclude_expense_id)
    return [i for i in query.all() if installment_effective_month_index(i) == target]


@dataclass
class MonthSummary:
    year: int
    month: int
    entries: list[Entry] = field(default_factory=list)
    direct_expenses: list[Expense] = field(default_factory=list)
    installments: list[Installment] = field(default_factory=list)

    @property
    def entries_total(self) -> Decimal:
        return sum((e.amount for e in self.entries), ZERO)

    @property
    def direct_expenses_total(self) -> Decimal:
        return sum((e.amount for e in self.direct_expenses), ZERO)

    @property
    def installments_total(self) -> Decimal:
        return sum((i.final_amount for i in self.installments), ZERO)

    @property
    def expenses_total(self) -> Decimal:
        return self.direct_expenses_total + self.installments_total

    @property
    def balance(self) -> Decimal:
        return self.entries_total - self.expenses_total


def get_month_summary(
    db: Session,
    user_id: int,
    year: int,
    month: int,
    *,
    exclude_entry_id: int | None = None,
    exclude_expense_id: int | None = None,
    exclude_planned: bool = False,
) -> MonthSummary:
    return MonthSummary(
        year=year,
        month=month,
        entries=get_applicable_entries(
            db, user_id, year, month, exclude_entry_id=exclude_entry_id, exclude_planned=exclude_planned
        ),
        direct_expenses=get_applicable_direct_expenses(
            db, user_id, year, month, exclude_expense_id=exclude_expense_id, exclude_planned=exclude_planned
        ),
        installments=get_applicable_installments(db, user_id, year, month, exclude_expense_id=exclude_expense_id),
    )


def get_earliest_data_month(db: Session, user_id: int) -> tuple[int, int] | None:
    """Earliest month with any financial activity for the user, used as the epoch for
    cumulative balance calculations (spec section 9: starts at R$0, carries months
    forward)."""
    candidates: list[date] = []

    entry_dates = (
        db.query(func.min(func.coalesce(Entry.start_date, Entry.date)))
        .filter(Entry.user_id == user_id, Entry.counts_toward_dashboard.is_(True))
        .scalar()
    )
    if entry_dates:
        candidates.append(entry_dates)

    expense_dates = db.query(
        func.min(func.coalesce(Expense.start_date, Expense.date))
    ).filter(Expense.user_id == user_id).scalar()
    if expense_dates:
        candidates.append(expense_dates)

    earliest_installment = (
        db.query(func.min(Installment.due_date))
        .join(Expense, Installment.expense_id == Expense.id)
        .filter(Expense.user_id == user_id)
        .scalar()
    )
    if earliest_installment:
        candidates.append(earliest_installment)

    # An advanced installment can move earlier than its own due_date (and, in an edge
    # case, earlier than every other candidate above) - it needs its own epoch check.
    advanced_months = (
        db.query(Installment.advanced_to_year, Installment.advanced_to_month)
        .join(Expense, Installment.expense_id == Expense.id)
        .filter(Expense.user_id == user_id, Installment.advanced_to_year.isnot(None))
        .all()
    )
    candidates.extend(date(year, month, 1) for year, month in advanced_months)

    if not candidates:
        return None

    earliest = min(candidates)
    return earliest.year, earliest.month


@dataclass
class MonthBalancePoint:
    year: int
    month: int
    entries_total: Decimal
    expenses_total: Decimal
    balance: Decimal
    cumulative_balance: Decimal
    is_projected: bool


def get_balance_series(
    db: Session,
    user_id: int,
    from_year: int,
    from_month: int,
    to_year: int,
    to_month: int,
    *,
    exclude_entry_id: int | None = None,
    exclude_expense_id: int | None = None,
    exclude_planned: bool = False,
) -> list[MonthBalancePoint]:
    """Cumulative balance always starts from R$0 at the user's earliest data month, and
    accumulates forward through every month up to `to_year`/`to_month` - months before
    `from_year`/`from_month` are computed too (to seed the running total correctly) but
    excluded from the returned list.

    `exclude_entry_id`/`exclude_expense_id` compute the series as if that one record
    never existed - used by impact_service to build a "with vs. without" counterfactual
    for a single entry/expense. `exclude_planned` instead excludes every Planejado
    entry/expense at once - used by planning_service to compare "saldo com os
    planejados" vs. "sem os planejados". The epoch itself is still the *real* earliest
    month (not recomputed excluding anything): if an excluded record happens to be the
    earliest transaction, every month up to the next real one still nets to zero either
    way, so this shortcut costs nothing in correctness."""
    today = date.today()
    current_idx = month_index(today.year, today.month)

    epoch = get_earliest_data_month(db, user_id)
    start_year, start_month = epoch if epoch else (from_year, from_month)
    if month_index(start_year, start_month) > month_index(from_year, from_month):
        start_year, start_month = from_year, from_month

    from_idx = month_index(from_year, from_month)

    points: list[MonthBalancePoint] = []
    cumulative = ZERO
    for year, month in iterate_months(start_year, start_month, to_year, to_month):
        summary = get_month_summary(
            db,
            user_id,
            year,
            month,
            exclude_entry_id=exclude_entry_id,
            exclude_expense_id=exclude_expense_id,
            exclude_planned=exclude_planned,
        )
        cumulative += summary.balance

        if month_index(year, month) >= from_idx:
            points.append(
                MonthBalancePoint(
                    year=year,
                    month=month,
                    entries_total=summary.entries_total,
                    expenses_total=summary.expenses_total,
                    balance=summary.balance,
                    cumulative_balance=cumulative,
                    is_projected=month_index(year, month) > current_idx,
                )
            )

    return points


def default_projection_range(months_ahead: int = 6) -> tuple[int, int, int, int]:
    """(from_year, from_month, to_year, to_month) covering the current month plus
    `months_ahead` future months - spec section 17 default is 6."""
    today = date.today()
    to_year, to_month = today.year, today.month
    for _ in range(months_ahead):
        to_year, to_month = _next_month(to_year, to_month)
    return today.year, today.month, to_year, to_month


# How far into the future the app is ever willing to project (GET /dashboard's
# projection_months caps here too) - an indefinite (no end_date) FIXED record would
# otherwise make every projection unbounded.
MAX_HORIZON_MONTHS = 60


def shift_month(year: int, month: int, n: int) -> tuple[int, int]:
    y, m = divmod(month_index(year, month) + n - 1, 12)
    return y, m + 1


@dataclass
class NavigableRange:
    """The span of months a month-by-month chart can be scrolled through: from the
    user's first month with any data up to the last month where anything still changes
    the balance. `last_reason` says why the range ends where it does - "HORIZON" (an
    indefinite FIXED rule keeps going, so the global projection cap applies) or
    "LAST_RECORD" (nothing contributes after that month: no more installments, every
    FIXED rule has ended, no later EXCEPTIONAL record)."""

    first_year: int
    first_month: int
    last_year: int
    last_month: int
    last_reason: str


def _has_indefinite_fixed_rule(db: Session, user_id: int) -> bool:
    """Any FIXED entry/expense with no end_date - it contributes "forever"."""
    indefinite_entry = (
        db.query(Entry.id)
        .filter(
            Entry.user_id == user_id,
            Entry.counts_toward_dashboard.is_(True),
            Entry.type == RecurrenceType.FIXED,
            Entry.end_date.is_(None),
        )
        .first()
    )
    indefinite_expense = (
        db.query(Expense.id)
        .filter(Expense.user_id == user_id, Expense.type == RecurrenceType.FIXED, Expense.end_date.is_(None))
        .first()
    )
    return indefinite_entry is not None or indefinite_expense is not None


def _latest_contributing_month(db: Session, user_id: int) -> tuple[int, int] | None:
    """Last month any record of the user still contributes to (None when there are no
    records at all), ignoring indefinite FIXED rules - check those with
    _has_indefinite_fixed_rule first. Mirrors the applicability rules above: FIXED ->
    end_date, EXCEPTIONAL -> date, CREDITO -> its installments' effective months (the
    purchase date itself never counts)."""
    candidates: list[int] = []
    entry_last = (
        db.query(func.max(func.coalesce(Entry.end_date, Entry.date)))
        .filter(Entry.user_id == user_id, Entry.counts_toward_dashboard.is_(True))
        .scalar()
    )
    if entry_last:
        candidates.append(month_index(entry_last.year, entry_last.month))

    expense_last = (
        db.query(func.max(func.coalesce(Expense.end_date, Expense.date)))
        .filter(Expense.user_id == user_id, Expense.payment_method == PaymentMethod.CONTA)
        .scalar()
    )
    if expense_last:
        candidates.append(month_index(expense_last.year, expense_last.month))

    installments = (
        db.query(Installment)
        .join(Expense, Installment.expense_id == Expense.id)
        .filter(Expense.user_id == user_id)
        .all()
    )
    candidates.extend(installment_effective_month_index(i) for i in installments)

    if not candidates:
        return None
    y, m = divmod(max(candidates) - 1, 12)
    return y, m + 1


def get_navigable_range(db: Session, user_id: int) -> NavigableRange:
    today = date.today()
    current = month_index(today.year, today.month)
    horizon = shift_month(today.year, today.month, MAX_HORIZON_MONTHS)

    first = get_earliest_data_month(db, user_id) or (today.year, today.month)
    if month_index(*first) > current:
        first = (today.year, today.month)

    indefinite = _has_indefinite_fixed_rule(db, user_id)
    latest = None if indefinite else _latest_contributing_month(db, user_id)
    if indefinite or (latest and month_index(*latest) >= month_index(*horizon)):
        last, reason = horizon, "HORIZON"
    else:
        # Never ends before the current month, even if every record is in the past.
        last = latest if latest and month_index(*latest) >= current else (today.year, today.month)
        reason = "LAST_RECORD"

    return NavigableRange(first[0], first[1], last[0], last[1], reason)
