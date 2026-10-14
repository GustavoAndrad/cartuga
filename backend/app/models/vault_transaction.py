from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Index, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.enums import CarveMode, VaultTransactionType


class VaultTransaction(Base):
    """One Cofre movement. Never the source of truth for money by itself - it always
    points at the real Entry (DEPOSIT_FRESH/WITHDRAWAL) or Expense (DEPOSIT_CARVE) that
    actually represents the amount in the ledger, so the vault's own balance math and
    the dashboard's math can never drift apart."""

    __tablename__ = "vault_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    type: Mapped[VaultTransactionType] = mapped_column(
        Enum(VaultTransactionType, native_enum=True), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)

    # Set for DEPOSIT_FRESH and WITHDRAWAL - the entry this transaction generated.
    entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("entries.id", ondelete="CASCADE"), nullable=True
    )
    # Set for DEPOSIT_CARVE - the expense this transaction generated.
    expense_id: Mapped[int | None] = mapped_column(
        ForeignKey("expenses.id", ondelete="CASCADE"), nullable=True
    )
    # DEPOSIT_CARVE only - traceability back to the entry it was carved from. SET NULL
    # (not CASCADE): deleting that entry elsewhere shouldn't wipe out the carve record
    # itself, just its backlink.
    source_entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("entries.id", ondelete="SET NULL"), nullable=True
    )
    carve_mode: Mapped[CarveMode | None] = mapped_column(Enum(CarveMode, native_enum=True), nullable=True)
    # Only meaningful when carve_mode == PERCENTAGE - `amount` already holds the
    # resulting value either way, this is just the % the user picked, for display.
    carve_percentage: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="vault_transactions")
    entry: Mapped["Entry | None"] = relationship(foreign_keys=[entry_id])
    expense: Mapped["Expense | None"] = relationship(foreign_keys=[expense_id])
    source_entry: Mapped["Entry | None"] = relationship(foreign_keys=[source_entry_id])

    __table_args__ = (Index("ix_vault_transactions_user_date", "user_id", "date"),)
