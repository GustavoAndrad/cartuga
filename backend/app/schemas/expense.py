from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.models.enums import Currency, PaymentMethod, RecurrenceType
from app.schemas.installment import InstallmentOut
from app.schemas.common import Description, Source


class ExpenseBase(BaseModel):
    date: date
    # See EntryBase.amount - same "entered in `currency`, converted to BRL server-side" deal.
    amount: Decimal
    currency: Currency = Currency.BRL
    description: Description
    source: Source
    type: RecurrenceType
    payment_method: PaymentMethod
    start_date: date | None = None
    end_date: date | None = None
    # Speculative/estimated expense, not yet confirmed - see docs/decisions.md
    # "Planejado". Allowed for CONTA expenses of either type: EXCEPTIONAL (confirm/
    # reject once) or FIXED (reviewed one month at a time - see
    # is_planned_since/ExpenseOccurrenceReview). Never CREDITO - its amount can't be
    # edited after creation anyway.
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

    @model_validator(mode="after")
    def fixed_expenses_are_always_conta(self):
        if self.type == RecurrenceType.FIXED and self.payment_method != PaymentMethod.CONTA:
            raise ValueError("Saídas fixas devem ter meio de pagamento CONTA.")
        return self

    @model_validator(mode="after")
    def planned_requires_conta(self):
        if self.is_planned and self.payment_method != PaymentMethod.CONTA:
            raise ValueError("Só uma saída à vista (Conta) pode ser marcada como Planejada.")
        return self


class ExpenseCreate(ExpenseBase):
    installments_count: int | None = None

    @model_validator(mode="after")
    def fixed_requires_start_date(self):
        if self.type == RecurrenceType.FIXED and self.start_date is None:
            raise ValueError("Saídas fixas exigem uma data de início.")
        return self

    @model_validator(mode="after")
    def installments_required_for_credit(self):
        if self.payment_method == PaymentMethod.CREDITO:
            if self.type != RecurrenceType.EXCEPTIONAL:
                raise ValueError("Compras no crédito devem ser do tipo EXCEPTIONAL.")
            if self.installments_count is None:
                raise ValueError("Compras no crédito exigem o número de parcelas.")
            if not (1 <= self.installments_count <= 24):
                raise ValueError("O número de parcelas deve estar entre 1 e 24.")
        elif self.installments_count is not None:
            raise ValueError("Número de parcelas só é aplicável a compras no crédito.")
        return self


class ExpenseUpdate(ExpenseBase):
    """Editing an expense never changes installment structure — see
    docs/decisions.md for why installment count/splits are immutable after creation."""


class ExpenseOut(ExpenseBase):
    """See EntryOut - `original_amount`/`exchange_rate`/`exchange_rate_date` carry the
    original entered value and the FX snapshot used to convert it to BRL."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    original_amount: Decimal
    exchange_rate: Decimal
    exchange_rate_date: date
    installments: list[InstallmentOut] = []
    # True when a Cofre recorte generated this expense - date/amount/currency/type
    # can't be edited from the Saídas screen in that case (see expense_service).
    is_vault_locked: bool
    # FIXED + is_planned only - see Expense.is_planned_since. Null for EXCEPTIONAL.
    is_planned_since: date | None
    created_at: datetime
    updated_at: datetime
