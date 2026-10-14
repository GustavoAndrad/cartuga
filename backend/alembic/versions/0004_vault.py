"""cofre (vault): deposits, carves, withdrawals

Revision ID: 0004_vault
Revises: 0003_installment_advance
Create Date: 2026-08-28

Adds:
- entries.counts_toward_dashboard: a "guardar do zero" vault deposit is registered as
  a real entry but must never count toward any dashboard total - existing rows default
  to true (unaffected, since none of them are vault-generated).
- vault_transactions: one row per Cofre movement (deposit-fresh / deposit-carve /
  withdrawal), each pointing at the real entry/expense that represents its amount in
  the ledger, plus (for carves) a traceability link back to the entry it was carved
  from.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_vault"
down_revision: Union[str, None] = "0003_installment_advance"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "entries",
        sa.Column("counts_toward_dashboard", sa.Boolean(), nullable=False, server_default="1"),
    )

    op.create_table(
        "vault_transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "type",
            sa.Enum("DEPOSIT_FRESH", "DEPOSIT_CARVE", "WITHDRAWAL", name="vaulttransactiontype"),
            nullable=False,
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("entry_id", sa.Integer(), sa.ForeignKey("entries.id", ondelete="CASCADE"), nullable=True),
        sa.Column(
            "expense_id", sa.Integer(), sa.ForeignKey("expenses.id", ondelete="CASCADE"), nullable=True
        ),
        sa.Column(
            "source_entry_id", sa.Integer(), sa.ForeignKey("entries.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("carve_mode", sa.Enum("PERCENTAGE", "FIXED", name="carvemode"), nullable=True),
        sa.Column("carve_percentage", sa.Numeric(5, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_vault_transactions_user_id", "vault_transactions", ["user_id"])
    op.create_index("ix_vault_transactions_user_date", "vault_transactions", ["user_id", "date"])


def downgrade() -> None:
    op.drop_table("vault_transactions")
    sa.Enum(name="vaulttransactiontype").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="carvemode").drop(op.get_bind(), checkfirst=True)
    op.drop_column("entries", "counts_toward_dashboard")
