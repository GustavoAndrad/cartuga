"""installment advance (prepay future installments)

Revision ID: 0003_installment_advance
Revises: 0002_entry_expense_currency
Create Date: 2026-08-28

Adds `advanced_to_year`/`advanced_to_month` to installments: nullable, set together or
not at all. `due_date` is never touched by advancing - these are a separate "counts
toward this month instead" overlay, so nothing needs backfilling for existing rows
(NULL = "not advanced", already correct for every row that exists today).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_installment_advance"
down_revision: Union[str, None] = "0002_entry_expense_currency"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("installments", sa.Column("advanced_to_year", sa.Integer(), nullable=True))
    op.add_column("installments", sa.Column("advanced_to_month", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("installments", "advanced_to_month")
    op.drop_column("installments", "advanced_to_year")
