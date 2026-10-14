from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class ImpactPointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    year: int
    month: int
    # This record's own contribution to that month's balance (0 in months it doesn't
    # apply) - positive for an entry, negative for an expense.
    direct_amount: Decimal
    cumulative_with: Decimal
    cumulative_without: Decimal
    cumulative_impact: Decimal
    is_projected: bool


class ImpactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    active_from_year: int
    active_from_month: int
    # None only when the record has no defined end (an indefinite FIXED entry/expense).
    active_until_year: int | None
    active_until_month: int | None
    is_indefinite: bool
    # The chart's last month - the app's max projection horizon, extended past the
    # record's own end so the "impact persists after it stops growing" plateau shows.
    horizon_year: int
    horizon_month: int
    points: list[ImpactPointOut]
