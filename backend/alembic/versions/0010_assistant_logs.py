"""assistente cartuga: complete per-turn logs for administrators

Revision ID: 0010_assistant_logs
Revises: 0009_assistant_trace
Create Date: 2026-10-13

Adds `assistant_logs`: one row per Assistente turn (answered or failed) and per
connection test, with the full pipeline trace - prompt, model calls, data consulted,
timings, errors. Shown in Gerenciamento → Logs do Assistente; kept for
ASSISTANT_LOG_DAYS. New table only.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_assistant_logs"
down_revision: Union[str, None] = "0009_assistant_trace"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assistant_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("trace_id", sa.String(32), nullable=False, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("conversation_id", sa.Integer(), nullable=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("provider", sa.String(30), nullable=True),
        sa.Column("model", sa.String(120), nullable=True),
        sa.Column("question", sa.Text(), nullable=True),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("llm_calls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tool_calls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("trace", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False, index=True),
    )


def downgrade() -> None:
    op.drop_table("assistant_logs")
