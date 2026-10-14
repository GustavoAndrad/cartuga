from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models.enums import PaymentMethod, RecurrenceType
from app.schemas.entry import EntryOut
from app.schemas.installment import InstallmentOut


class DistributionItemOut(BaseModel):
    label: str
    total: Decimal


class DistributionOut(BaseModel):
    by_source: list[DistributionItemOut]
    by_type: list[DistributionItemOut]


class DashboardCardsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    current_balance: Decimal
    previous_month_balance: Decimal
    current_month_income: Decimal
    current_month_expenses: Decimal
    projected_balance: Decimal
    committed_installments: Decimal
    vault_balance: Decimal


class MonthPointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    year: int
    month: int
    entries_total: Decimal
    expenses_total: Decimal
    balance: Decimal
    cumulative_balance: Decimal
    is_projected: bool


class CurrentMonthOut(BaseModel):
    year: int
    month: int


class NavigableRangeOut(BaseModel):
    """Months a month-by-month chart can be scrolled through - see
    finance_engine.NavigableRange."""

    model_config = ConfigDict(from_attributes=True)

    first_year: int
    first_month: int
    last_year: int
    last_month: int
    # "HORIZON" (capped at the app-wide projection limit) or "LAST_RECORD" (nothing
    # changes the balance after this month).
    last_reason: str


class DashboardOut(BaseModel):
    current_month: CurrentMonthOut
    cards: DashboardCardsOut
    time_series: list[MonthPointOut]
    navigable_range: NavigableRangeOut
    entries_distribution: DistributionOut
    expenses_distribution: DistributionOut


class MonthExpenseLineOut(BaseModel):
    expense_id: int
    description: str
    source: str
    type: RecurrenceType
    payment_method: PaymentMethod
    amount: Decimal
    date: date
    installment: InstallmentOut | None = None
    # Always False for a CREDITO installment line - only a CONTA+EXCEPTIONAL expense
    # can ever be Planejado (see docs/decisions.md).
    is_planned: bool = False


class MonthDetailOut(BaseModel):
    year: int
    month: int
    entries: list[EntryOut]
    expenses: list[MonthExpenseLineOut]
    entries_total: Decimal
    expenses_total: Decimal
    balance: Decimal
    entries_distribution: DistributionOut
    expenses_distribution: DistributionOut
