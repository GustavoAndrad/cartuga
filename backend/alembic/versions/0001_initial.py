"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-08-24

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("photo", sa.String(500), nullable=True),
        sa.Column("role", sa.Enum("USER", "ADMIN", name="userrole"), nullable=False, server_default="USER"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])

    recurrence_type = sa.Enum("FIXED", "EXCEPTIONAL", name="recurrencetype")

    op.create_table(
        "entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("source", sa.String(150), nullable=False),
        sa.Column("type", recurrence_type, nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_entries_user_id", "entries", ["user_id"])
    op.create_index("ix_entries_user_date", "entries", ["user_id", "date"])
    op.create_index("ix_entries_user_type", "entries", ["user_id", "type"])

    op.create_table(
        "expenses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("source", sa.String(150), nullable=False),
        sa.Column("type", recurrence_type, nullable=False),
        sa.Column("payment_method", sa.Enum("CONTA", "CREDITO", name="paymentmethod"), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_expenses_user_id", "expenses", ["user_id"])
    op.create_index("ix_expenses_user_date", "expenses", ["user_id", "date"])
    op.create_index("ix_expenses_user_type", "expenses", ["user_id", "type"])
    op.create_index("ix_expenses_user_payment_method", "expenses", ["user_id", "payment_method"])

    op.create_table(
        "installments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "expense_id", sa.Integer(), sa.ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("installment_number", sa.Integer(), nullable=False),
        sa.Column("total_installments", sa.Integer(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("base_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "expense_id", "installment_number", name="uq_installment_expense_number"
        ),
    )
    op.create_index("ix_installments_expense_id", "installments", ["expense_id"])
    op.create_index("ix_installments_due_date", "installments", ["due_date"])

    op.create_table(
        "installment_adjustments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "installment_id",
            sa.Integer(),
            sa.ForeignKey("installments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_installment_adjustments_installment_id", "installment_adjustments", ["installment_id"]
    )


def downgrade() -> None:
    op.drop_table("installment_adjustments")
    op.drop_table("installments")
    op.drop_table("expenses")
    op.drop_table("entries")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
    sa.Enum(name="recurrencetype").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="paymentmethod").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="userrole").drop(op.get_bind(), checkfirst=True)
