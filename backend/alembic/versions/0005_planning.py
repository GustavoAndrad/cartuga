"""planning: is_planned flag on entries/expenses

Revision ID: 0005_planning
Revises: 0004_vault
Create Date: 2026-08-30

Adds `is_planned` (default false) to entries and expenses - a manually-set marker for
a speculative/estimated record (spec: "guess now, confirm the real value later"),
restricted to EXCEPTIONAL entries and CONTA+EXCEPTIONAL expenses at the application
layer (a FIXED rule or a CREDITO purchase has no single "did this happen" moment to
confirm/reject, or - for CREDITO - can't have its amount edited after the fact anyway).
Existing rows default to false (unaffected - none of them were ever planned).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_planning"
down_revision: Union[str, None] = "0004_vault"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("entries", sa.Column("is_planned", sa.Boolean(), nullable=False, server_default="0"))
    op.add_column("expenses", sa.Column("is_planned", sa.Boolean(), nullable=False, server_default="0"))
    op.create_index("ix_entries_user_is_planned", "entries", ["user_id", "is_planned"])
    op.create_index("ix_expenses_user_is_planned", "expenses", ["user_id", "is_planned"])


def downgrade() -> None:
    op.drop_index("ix_expenses_user_is_planned", table_name="expenses")
    op.drop_index("ix_entries_user_is_planned", table_name="entries")
    op.drop_column("expenses", "is_planned")
    op.drop_column("entries", "is_planned")
