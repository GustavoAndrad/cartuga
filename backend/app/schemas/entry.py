from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.models.enums import Currency, RecurrenceType
from app.schemas.common import Description, Source


class EntryBase(BaseModel):
    date: date
    # The amount as entered by the user, in `currency` - not necessarily BRL. The
    # server converts and stores the BRL-equivalent (see EntryOut.amount) using the
    # exchange rate as of `date`.
    amount: Decimal
    currency: Currency = Currency.BRL
    description: Description
    source: Source
    type: RecurrenceType
    start_date: date | None = None
    end_date: date | None = None
    # Speculative/estimated entry, not yet confirmed - see docs/decisions.md
    # "Planejado". Allowed for both EXCEPTIONAL (confirm/reject once) and FIXED
    # (reviewed one month at a time - see is_planned_since/EntryOccurrenceReview).
    is_planned: bool = False

    @field_validator("amount")
    @classmethod
    def amount_must_be_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("O valor deve ser maior que zero.")
        return v

    @model_validator(mode="after")
    def end_date_after_start_date(self):
        if self.end_date is not None and self.start_date is not None and self.end_date < self.start_date:
            raise ValueError("A data de término não pode ser anterior à data de início.")
        return self


class EntryCreate(EntryBase):
    @model_validator(mode="after")
    def fixed_requires_start_date(self):
        if self.type == RecurrenceType.FIXED and self.start_date is None:
            raise ValueError("Entradas fixas exigem uma data de início.")
        return self


class EntryUpdate(EntryBase):
    pass


class EntryOut(EntryBase):
    """`amount`/`currency` here are the stored BRL-canonical values (inherited from
    EntryBase, but server-populated) - `original_amount`/`exchange_rate`/
    `exchange_rate_date` carry what the user actually entered and the FX snapshot used,
    for display."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    original_amount: Decimal
    exchange_rate: Decimal
    exchange_rate_date: date
    counts_toward_dashboard: bool
    # True when a Cofre transaction generated this entry - date/amount/currency/type
    # can't be edited from the Entradas screen in that case (see entry_service).
    is_vault_locked: bool
    # FIXED + is_planned only - see Entry.is_planned_since. Null for EXCEPTIONAL.
    is_planned_since: date | None
    created_at: datetime
    updated_at: datetime
