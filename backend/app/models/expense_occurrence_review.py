from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.enums import OccurrenceReviewStatus


class ExpenseOccurrenceReview(Base):
    """See EntryOccurrenceReview - same per-month Confirmar/Recusar tracking, for a
    FIXED (always CONTA) + Planejado expense."""

    __tablename__ = "expense_occurrence_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    expense_id: Mapped[int] = mapped_column(ForeignKey("expenses.id", ondelete="CASCADE"), index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[OccurrenceReviewStatus] = mapped_column(
        Enum(OccurrenceReviewStatus, native_enum=True), nullable=False
    )
    override_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("expense_id", "year", "month", name="uq_expense_occurrence_review"),)
