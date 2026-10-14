"""assistente cartuga: per-user LLM settings

Revision ID: 0008_assistant_settings
Revises: 0007_assistant_chat
Create Date: 2026-10-06

Each user may bring their own provider/model/API key (stored encrypted). New table
only; cascades at the database level like the chat tables.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_assistant_settings"
down_revision: Union[str, None] = "0007_assistant_chat"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assistant_settings",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("model", sa.String(120), nullable=True),
        sa.Column("base_url", sa.String(255), nullable=True),
        sa.Column("api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("assistant_settings")
