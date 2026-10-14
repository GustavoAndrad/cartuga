from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, Numeric, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Installment(Base):
    __tablename__ = "installments"

    id: Mapped[int] = mapped_column(primary_key=True)
    expense_id: Mapped[int] = mapped_column(
        ForeignKey("expenses.id", ondelete="CASCADE"), index=True
    )

    installment_number: Mapped[int] = mapped_column(Integer, nullable=False)
    total_installments: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    base_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    # Set together, both null (the common case) or both filled - never independently.
    # A future installment can be "advanced": paid early and counted in the month it
    # was advanced in (advanced_to_year/month) instead of its original due_date's
    # month. due_date itself is never touched - the original schedule stays intact for
    # history/transparency, and every month-matching query falls back to it when these
    # are null. See finance_engine.py's `_installment_effective_month`.
    advanced_to_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    advanced_to_month: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    expense: Mapped["Expense"] = relationship(back_populates="installments")
    adjustments: Mapped[list["InstallmentAdjustment"]] = relationship(
        back_populates="installment", cascade="all, delete-orphan"
    )

    @property
    def final_amount(self) -> Decimal:
        return self.base_amount + sum((a.amount for a in self.adjustments), Decimal("0"))

    __table_args__ = (
        UniqueConstraint("expense_id", "installment_number", name="uq_installment_expense_number"),
        Index("ix_installments_due_date", "due_date"),
    )
