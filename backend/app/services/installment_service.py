"""Splits a credit purchase into its installments (spec section 14/15)."""

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_DOWN, Decimal

from app.services.finance_engine import add_months

CENTS = Decimal("0.01")


@dataclass
class InstallmentPlanItem:
    installment_number: int
    total_installments: int
    due_date: date
    base_amount: Decimal


def build_installment_plan(
    purchase_date: date, total_amount: Decimal, count: int
) -> list[InstallmentPlanItem]:
    """total_amount is split evenly with cents precision; any leftover cent(s) from
    rounding are absorbed into the LAST installment so the parcels always sum exactly
    to total_amount (e.g. R$100 / 3 -> 33.33, 33.33, 33.34)."""
    base = (total_amount / count).quantize(CENTS, rounding=ROUND_DOWN)
    allocated = base * (count - 1)
    last_amount = (total_amount - allocated).quantize(CENTS)

    plan = []
    for n in range(1, count + 1):
        amount = base if n < count else last_amount
        plan.append(
            InstallmentPlanItem(
                installment_number=n,
                total_installments=count,
                due_date=add_months(purchase_date, n - 1),
                base_amount=amount,
            )
        )
    return plan
