"""entry/expense currency + FX snapshot

Revision ID: 0002_entry_expense_currency
Revises: 0001_initial
Create Date: 2026-08-27

Adds multi-currency support to entries/expenses: `amount` stays the BRL-canonical
value every dashboard/projection calculation already relies on, while `currency` /
`original_amount` / `exchange_rate` / `exchange_rate_date` record what the user
actually entered and the FX snapshot used to convert it. Existing rows are implicitly
BRL, so they're backfilled with a 1:1 rate dated to their own transaction date.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_entry_expense_currency"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = ("entries", "expenses")


def upgrade() -> None:
    currency_enum = sa.Enum("BRL", "USD", "EUR", name="currency")
    currency_enum.create(op.get_bind(), checkfirst=True)

    for table in _TABLES:
        op.add_column(
            table,
            sa.Column("currency", currency_enum, nullable=False, server_default="BRL"),
        )
        op.add_column(table, sa.Column("original_amount", sa.Numeric(12, 2), nullable=True))
        op.add_column(
            table,
            sa.Column("exchange_rate", sa.Numeric(12, 6), nullable=False, server_default="1"),
        )
        op.add_column(table, sa.Column("exchange_rate_date", sa.Date(), nullable=True))

        op.execute(f"UPDATE {table} SET original_amount = amount, exchange_rate_date = date")

        op.alter_column(table, "original_amount", existing_type=sa.Numeric(12, 2), nullable=False)
        op.alter_column(table, "exchange_rate_date", existing_type=sa.Date(), nullable=False)


def downgrade() -> None:
    for table in _TABLES:
        op.drop_column(table, "exchange_rate_date")
        op.drop_column(table, "exchange_rate")
        op.drop_column(table, "original_amount")
        op.drop_column(table, "currency")

    sa.Enum(name="currency").drop(op.get_bind(), checkfirst=True)
