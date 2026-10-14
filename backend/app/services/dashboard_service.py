"""Aggregations consumed by GET /dashboard and GET /dashboard/month/:year/:month.

All numbers come from app.services.finance_engine - this module only shapes/aggregates
what the finance engine already computes; it never re-derives applicability rules.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.expense import Expense
from app.models.installment import Installment
from app.services import finance_engine as fe
from app.services import vault_service
from app.utils.errors import ValidationAppError

ZERO = Decimal("0")


def _group_totals(items, amount_fn, key_fn) -> list[dict]:
    totals: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for item in items:
        totals[key_fn(item)] += amount_fn(item)
    return [{"label": label, "total": total} for label, total in totals.items()]


def _entries_distribution(entries) -> dict:
    return {
        "by_source": _group_totals(entries, lambda e: e.amount, lambda e: e.source),
        "by_type": _group_totals(entries, lambda e: e.amount, lambda e: e.type.value),
    }


def _expenses_distribution(direct_expenses, installments) -> dict:
    by_source: dict[str, Decimal] = defaultdict(lambda: ZERO)
    by_type: dict[str, Decimal] = defaultdict(lambda: ZERO)

    for expense in direct_expenses:
        by_source[expense.source] += expense.amount
        by_type[expense.type.value] += expense.amount

    for installment in installments:
        expense = installment.expense
        by_source[expense.source] += installment.final_amount
        by_type[expense.type.value] += installment.final_amount

    return {
        "by_source": [{"label": k, "total": v} for k, v in by_source.items()],
        "by_type": [{"label": k, "total": v} for k, v in by_type.items()],
    }


def get_committed_installments_total(db: Session, user_id: int, from_year: int, from_month: int) -> Decimal:
    """Every installment amount (base + adjustments) still counting toward `from_year`/
    `from_month` or later, with no upper bound - the true remaining commitment,
    independent of how far the dashboard's projection window happens to extend. Uses
    each installment's effective month (see finance_engine), not its raw due_date: one
    advanced earlier drops out of "committed" as soon as the current month passes the
    month it was advanced into, since by then it's already been counted as spent."""
    target = fe.month_index(from_year, from_month)
    installments = (
        db.query(Installment)
        .join(Expense, Installment.expense_id == Expense.id)
        .filter(Expense.user_id == user_id)
        .all()
    )
    return sum(
        (i.final_amount for i in installments if fe.installment_effective_month_index(i) >= target),
        ZERO,
    )


@dataclass
class DashboardCards:
    current_balance: Decimal
    previous_month_balance: Decimal
    current_month_income: Decimal
    current_month_expenses: Decimal
    projected_balance: Decimal
    committed_installments: Decimal
    vault_balance: Decimal


def build_dashboard(
    db: Session,
    user_id: int,
    history_months: int = 6,
    projection_months: int = 6,
) -> dict:
    today = date.today()
    year, month = today.year, today.month

    history_start_year, history_start_month = year, month
    for _ in range(history_months):
        history_start_year, history_start_month = _shift_back(history_start_year, history_start_month)

    _, _, projection_end_year, projection_end_month = fe.default_projection_range(projection_months)

    series = fe.get_balance_series(
        db, user_id, history_start_year, history_start_month, projection_end_year, projection_end_month
    )

    current_point = next((p for p in series if p.year == year and p.month == month), None)
    prev_year, prev_month = _shift_back(year, month)
    prev_point = next((p for p in series if p.year == prev_year and p.month == prev_month), None)
    projected_point = series[-1] if series else None

    current_summary = fe.get_month_summary(db, user_id, year, month)

    cards = DashboardCards(
        current_balance=current_point.cumulative_balance if current_point else ZERO,
        previous_month_balance=prev_point.cumulative_balance if prev_point else ZERO,
        current_month_income=current_summary.entries_total,
        current_month_expenses=current_summary.expenses_total,
        projected_balance=projected_point.cumulative_balance if projected_point else ZERO,
        committed_installments=get_committed_installments_total(db, user_id, year, month),
        vault_balance=vault_service.get_vault_balance(db, user_id),
    )

    return {
        "current_month": {"year": year, "month": month},
        "cards": cards,
        "time_series": series,
        "navigable_range": fe.get_navigable_range(db, user_id),
        "entries_distribution": _entries_distribution(current_summary.entries),
        "expenses_distribution": _expenses_distribution(
            current_summary.direct_expenses, current_summary.installments
        ),
    }


def get_series_window(db: Session, user_id: int, from_year: int, from_month: int, months: int):
    """An arbitrary `months`-long slice of the same balance series GET /dashboard
    returns - used when a chart is scrolled away from its default window. Rejects a
    window reaching past the projection horizon (the charts never go further, and it
    keeps a single request from looping through centuries of months)."""
    today = date.today()
    to_year, to_month = fe.shift_month(from_year, from_month, months - 1)
    horizon = fe.shift_month(today.year, today.month, fe.MAX_HORIZON_MONTHS)
    if fe.month_index(to_year, to_month) > fe.month_index(*horizon):
        raise ValidationAppError(
            f"O período pedido passa do limite de projeção ({fe.MAX_HORIZON_MONTHS} meses à frente)."
        )
    return fe.get_balance_series(db, user_id, from_year, from_month, to_year, to_month)


def _shift_back(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def _month_expense_lines(direct_expenses, installments) -> list[dict]:
    lines = [
        {
            "expense_id": e.id,
            "description": e.description,
            "source": e.source,
            "type": e.type,
            "payment_method": e.payment_method,
            "amount": e.amount,
            "date": e.date,
            "installment": None,
            "is_planned": e.is_planned,
        }
        for e in direct_expenses
    ]
    lines += [
        {
            "expense_id": i.expense_id,
            "description": i.expense.description,
            "source": i.expense.source,
            "type": i.expense.type,
            "payment_method": i.expense.payment_method,
            "amount": i.final_amount,
            "date": i.due_date,
            "installment": i,
            "is_planned": False,  # a CREDITO purchase can never be Planejado
        }
        for i in installments
    ]
    return lines


def build_month_detail(db: Session, user_id: int, year: int, month: int) -> dict:
    summary = fe.get_month_summary(db, user_id, year, month)
    return {
        "year": year,
        "month": month,
        "entries": summary.entries,
        "expenses": _month_expense_lines(summary.direct_expenses, summary.installments),
        "entries_total": summary.entries_total,
        "expenses_total": summary.expenses_total,
        "balance": summary.balance,
        "entries_distribution": _entries_distribution(summary.entries),
        "expenses_distribution": _expenses_distribution(summary.direct_expenses, summary.installments),
    }
