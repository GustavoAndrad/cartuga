"""assistente cartuga: pipeline trace per answer

Revision ID: 0009_assistant_trace
Revises: 0008_assistant_settings
Create Date: 2026-10-06

Adds `chat_messages.trace`: the step-by-step record of how each answer was produced
(model calls, tools, data returned, amount check). Nullable - older answers have none.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_assistant_trace"
down_revision: Union[str, None] = "0008_assistant_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("trace", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_messages", "trace")
