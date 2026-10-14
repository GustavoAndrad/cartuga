from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Index, Numeric, String, func
from sqlalchemy.orm import Mapped, foreign, mapped_column, relationship

from app.database.base import Base
from app.models.enums import Currency, PaymentMethod, RecurrenceType
from app.models.vault_transaction import VaultTransaction


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    date: Mapped[date] = mapped_column(Date, nullable=False)
    # See Entry.amount - same BRL-canonical / original-currency-snapshot split.
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[Currency] = mapped_column(
        Enum(Currency, native_enum=True), nullable=False, server_default=Currency.BRL.value
    )
    # See Entry.original_amount/exchange_rate_date - same Python-side default fallback.
    original_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=lambda ctx: ctx.get_current_parameters()["amount"]
    )
    exchange_rate: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False, server_default="1", default=Decimal("1"))
    exchange_rate_date: Mapped[date] = mapped_column(
        Date, nullable=False, default=lambda ctx: ctx.get_current_parameters()["date"]
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    source: Mapped[str] = mapped_column(String(150), nullable=False)
    type: Mapped[RecurrenceType] = mapped_column(Enum(RecurrenceType, native_enum=True), nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod, native_enum=True), nullable=False
    )

    # Manually set: a speculative/estimated expense, not yet confirmed as the real
    # value - still counts normally everywhere, this is purely a review-workflow
    # marker. Allowed for CONTA expenses of either type (EXCEPTIONAL: a single record
    # to confirm/reject once; FIXED: a recurring rule reviewed one month at a time -
    # see is_planned_since and ExpenseOccurrenceReview). Never CREDITO - its amount
    # can't be edited after creation anyway (see _CREDIT_IMMUTABLE_FIELDS), which would
    # defeat "confirm the real value" for one.
    is_planned: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="0", default=False)

    # See Entry.is_planned_since - same FIXED-only review-backlog anchor.
    is_planned_since: Mapped[date | None] = mapped_column(Date, nullable=True)

    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="expenses")
    installments: Mapped[list["Installment"]] = relationship(
        back_populates="expense", cascade="all, delete-orphan"
    )
    # Read-only: the Cofre DEPOSIT_CARVE transaction that generated this expense, if
    # any. Not the FK-owning side - viewonly avoids SQLAlchemy trying to manage
    # VaultTransaction.expense_id through this relationship too.
    vault_transaction: Mapped["VaultTransaction | None"] = relationship(
        VaultTransaction,
        primaryjoin=lambda: Expense.id == foreign(VaultTransaction.expense_id),
        viewonly=True,
        uselist=False,
    )

    __table_args__ = (
        Index("ix_expenses_user_date", "user_id", "date"),
        Index("ix_expenses_user_type", "user_id", "type"),
        Index("ix_expenses_user_payment_method", "user_id", "payment_method"),
        Index("ix_expenses_user_is_planned", "user_id", "is_planned"),
    )

    @property
    def is_vault_locked(self) -> bool:
        """True for an expense a Cofre recorte generated - date/amount/currency/type
        are locked to keep vault_transactions.amount/date (a snapshot, not a live join)
        from drifting out of sync. See expense_service.update_expense."""
        return self.vault_transaction is not None
