from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_validator
from app.schemas.common import Description


class InstallmentAdjustmentCreate(BaseModel):
    amount: Decimal
    description: Description

    @field_validator("amount")
    @classmethod
    def amount_cannot_be_zero(cls, v: Decimal) -> Decimal:
        if v == 0:
            raise ValueError("O valor do ajuste não pode ser zero.")
        return v


class InstallmentAdjustmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    installment_id: int
    amount: Decimal
    description: str
    created_at: datetime
    updated_at: datetime


class InstallmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    expense_id: int
    installment_number: int
    total_installments: int
    due_date: date
    base_amount: Decimal
    advanced_to_year: int | None
    advanced_to_month: int | None
    adjustments: list[InstallmentAdjustmentOut] = []
    final_amount: Decimal
    created_at: datetime
    updated_at: datetime
