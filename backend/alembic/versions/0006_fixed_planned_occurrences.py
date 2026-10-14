"""fixed planejado: per-occurrence review

Revision ID: 0006_fixed_planned_occurrences
Revises: 0005_planning
Create Date: 2026-08-31

Lets a FIXED entry/expense (CONTA only, for expenses) be marked Planejado too, not
just EXCEPTIONAL - the restriction itself was purely an application-layer Pydantic
validator (see schemas/entry.py, schemas/expense.py), so no column changes were needed
for that part. What FIXED needs that EXCEPTIONAL didn't: a recurring rule has no single
"did this happen" moment, so it's reviewed one month at a time instead.

`is_planned_since` anchors how far back planning_service looks for unreviewed monthly
occurrences (so turning Planejado on for an old rule doesn't flood the queue with years
of past months). `entry_occurrence_reviews`/`expense_occurrence_reviews` record each
month's Confirmar (optionally with a value just for that month) / Recusar (that month
excluded from calculations) decision - absence of a row means still pending, and the
occurrence keeps counting at the rule's normal amount either way (spec: "Planejado
counts normally until acted on").
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_fixed_planned_occurrences"
down_revision: Union[str, None] = "0005_planning"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("entries", sa.Column("is_planned_since", sa.Date(), nullable=True))
    op.add_column("expenses", sa.Column("is_planned_since", sa.Date(), nullable=True))

    status_enum = sa.Enum("CONFIRMED", "REJECTED", name="occurrencereviewstatus")

    op.create_table(
        "entry_occurrence_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("entry_id", sa.Integer(), sa.ForeignKey("entries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("status", status_enum, nullable=False),
        sa.Column("override_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("entry_id", "year", "month", name="uq_entry_occurrence_review"),
    )
    op.create_index("ix_entry_occurrence_reviews_entry_id", "entry_occurrence_reviews", ["entry_id"])

    op.create_table(
        "expense_occurrence_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("expense_id", sa.Integer(), sa.ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("status", status_enum, nullable=False),
        sa.Column("override_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("expense_id", "year", "month", name="uq_expense_occurrence_review"),
    )
    op.create_index("ix_expense_occurrence_reviews_expense_id", "expense_occurrence_reviews", ["expense_id"])


def downgrade() -> None:
    op.drop_table("expense_occurrence_reviews")
    op.drop_table("entry_occurrence_reviews")
    sa.Enum(name="occurrencereviewstatus").drop(op.get_bind(), checkfirst=True)
    op.drop_column("expenses", "is_planned_since")
    op.drop_column("entries", "is_planned_since")
