from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Index, Numeric, String, func
from sqlalchemy.orm import Mapped, foreign, mapped_column, relationship

from app.database.base import Base
from app.models.enums import Currency, RecurrenceType
from app.models.vault_transaction import VaultTransaction


class Entry(Base):
    __tablename__ = "entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    date: Mapped[date] = mapped_column(Date, nullable=False)
    # `amount` is always the BRL equivalent (the canonical value every aggregation/
    # projection calculation in the app operates on). When the entry was created in a
    # foreign currency, `original_amount`/`currency`/`exchange_rate`/`exchange_rate_date`
    # record what the user actually entered and the FX snapshot used to convert it -
    # otherwise they just mirror `amount`/`date` with a 1:1 rate.
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[Currency] = mapped_column(
        Enum(Currency, native_enum=True), nullable=False, server_default=Currency.BRL.value
    )
    # Python-side defaults (not server_default) so any direct ORM construction that
    # doesn't go through entry_service's currency resolution - tests, the import
    # pathway - still gets a valid, consistent BRL row for free.
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

    # False only for the entry a Cofre "guardar do zero" deposit generates (see
    # vault_service) - money that never came from the tracked cashflow in the first
    # place, so it must stay out of every dashboard/finance_engine total. Every other
    # entry - including a Cofre withdrawal's - is a normal, counted entry.
    counts_toward_dashboard: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="1", default=True)

    # Manually set: a speculative/estimated entry, not yet confirmed as the real
    # value - still counts normally everywhere (spec: "impacto normal nos cálculos"),
    # this is purely a review-workflow marker. Allowed for both EXCEPTIONAL (a single
    # record to confirm/reject once) and FIXED (a recurring rule reviewed one month at
    # a time - see is_planned_since and EntryOccurrenceReview) entries.
    is_planned: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="0", default=False)

    # FIXED + is_planned only: the month review started (stamped by entry_service the
    # moment is_planned turns on for a FIXED entry, cleared when it turns back off).
    # Bounds how far back planning_service looks for unreviewed monthly occurrences -
    # turning Planejado on for an old rule never retroactively floods the review queue
    # with years of past months. Unused/None for an EXCEPTIONAL entry, which uses its
    # own `date` instead.
    is_planned_since: Mapped[date | None] = mapped_column(Date, nullable=True)

    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="entries")
    # Read-only: the Cofre transaction that generated this entry (DEPOSIT_FRESH or
    # WITHDRAWAL), if any. Not the FK-owning side - viewonly avoids SQLAlchemy trying
    # to manage VaultTransaction.entry_id through this relationship too.
    vault_transaction: Mapped["VaultTransaction | None"] = relationship(
        VaultTransaction,
        primaryjoin=lambda: Entry.id == foreign(VaultTransaction.entry_id),
        viewonly=True,
        uselist=False,
    )

    __table_args__ = (
        Index("ix_entries_user_date", "user_id", "date"),
        Index("ix_entries_user_type", "user_id", "type"),
        Index("ix_entries_user_is_planned", "user_id", "is_planned"),
    )

    @property
    def is_vault_locked(self) -> bool:
        """True for an entry the Cofre itself generated - date/amount/currency/type are
        locked to keep vault_transactions.amount/date (a snapshot, not a live join) from
        drifting out of sync. See entry_service.update_entry."""
        return self.vault_transaction is not None
