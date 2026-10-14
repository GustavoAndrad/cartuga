from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.enums import OccurrenceReviewStatus


class EntryOccurrenceReview(Base):
    """A single month's Confirmar/Recusar decision for a FIXED + Planejado entry - see
    Entry.is_planned_since. Absence of a row for (entry_id, year, month) means that
    occurrence is still pending review (and, until acted on, keeps counting at the
    rule's normal `amount` - see finance_engine.get_applicable_entries)."""

    __tablename__ = "entry_occurrence_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("entries.id", ondelete="CASCADE"), index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[OccurrenceReviewStatus] = mapped_column(
        Enum(OccurrenceReviewStatus, native_enum=True), nullable=False
    )
    # CONFIRMED only: the real amount for just this month, if different from the rule's
    # `amount` - null means "confirmed exactly as estimated". Ignored for REJECTED,
    # since that month contributes nothing regardless of amount.
    override_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("entry_id", "year", "month", name="uq_entry_occurrence_review"),)
