from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.enums import CarveMode, VaultTransactionType
from app.schemas.entry import EntryOut
from app.schemas.expense import ExpenseOut
from app.schemas.common import Description


class VaultTransactionCreate(BaseModel):
    type: VaultTransactionType
    date: date
    description: Description

    # DEPOSIT_FRESH / WITHDRAWAL only.
    amount: Decimal | None = None

    # DEPOSIT_CARVE only: which entry to carve from, and how much - either a
    # percentage of it (0-100) or a fixed BRL amount, per `carve_mode`.
    source_entry_id: int | None = None
    carve_mode: CarveMode | None = None
    carve_value: Decimal | None = None

    @model_validator(mode="after")
    def validate_fields_for_type(self):
        if self.type in (VaultTransactionType.DEPOSIT_FRESH, VaultTransactionType.WITHDRAWAL):
            if self.amount is None or self.amount <= 0:
                raise ValueError("Informe um valor maior que zero.")
        elif self.type == VaultTransactionType.DEPOSIT_CARVE:
            if self.source_entry_id is None:
                raise ValueError("Selecione a entrada de origem do recorte.")
            if self.carve_mode is None or self.carve_value is None or self.carve_value <= 0:
                raise ValueError("Informe o percentual ou o valor do recorte.")
            if self.carve_mode == CarveMode.PERCENTAGE and self.carve_value > 100:
                raise ValueError("O percentual do recorte não pode ser maior que 100.")
        return self


class VaultTransactionOut(BaseModel):
    """`entry`/`expense` are the real ledger record this transaction represents;
    `source_entry` (DEPOSIT_CARVE only) is the traceability link back to the entry it
    was carved from."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    type: VaultTransactionType
    date: date
    amount: Decimal
    description: str
    entry_id: int | None
    expense_id: int | None
    source_entry_id: int | None
    carve_mode: CarveMode | None
    carve_percentage: Decimal | None
    entry: EntryOut | None
    expense: ExpenseOut | None
    source_entry: EntryOut | None
    created_at: datetime
    updated_at: datetime


class CarveableEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entry: EntryOut
    remaining_amount: Decimal


class VaultMonthPointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    year: int
    month: int
    deposits_total: Decimal
    withdrawals_total: Decimal
    net: Decimal
    cumulative_balance: Decimal


class VaultSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    balance: Decimal
    total_deposited: Decimal
    total_withdrawn: Decimal
    monthly_series: list[VaultMonthPointOut]
