from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.enums import ChatRole


class ChatConversation(Base):
    """One Assistente Cartuga conversation. Messages older than
    ASSISTANT_HISTORY_DAYS are purged (see assistant/service.py), and a conversation
    left without messages goes with them."""

    __tablename__ = "chat_conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="ChatMessage.id"
    )


class ChatMessage(Base):
    """A visible message (user question or assistant answer). The intermediate
    tool-call exchange of a turn is not stored - only the answer plus `sources` (which
    data it was built from), keeping later turns' context small and auditable."""

    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("chat_conversations.id", ondelete="CASCADE"))
    role: Mapped[ChatRole] = mapped_column(Enum(ChatRole, native_enum=True), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Assistant only: [{tool, label}] - the data lookups the answer was based on.
    sources: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Assistant only: {"caution": bool, "unverified_amounts": [str]} - see service.py.
    flags: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Assistant only: the step-by-step pipeline trace of the turn that produced this
    # answer (assistant/trace.py) - shown in the chat as "Raciocínio".
    trace: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    conversation: Mapped["ChatConversation"] = relationship(back_populates="messages")

    __table_args__ = (Index("ix_chat_messages_conversation_created", "conversation_id", "created_at"),)


class AssistantSettings(Base):
    """A user's own LLM configuration for the Assistente - absent (or provider
    "system") means "use the server's default". The API key is stored encrypted
    (assistant/secrets.py) and never sent back to the client."""

    __tablename__ = "assistant_settings"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class AssistantLog(Base):
    """The complete record of one Assistente turn - answered, failed or a connection
    test - for the administrators' log screen (assistant/audit.py). Unlike
    chat_messages it's written even when nothing is answered, and it has its own
    retention (ASSISTANT_LOG_DAYS). The denormalized columns exist for filtering and
    listing; `trace` has everything."""

    __tablename__ = "assistant_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    trace_id: Mapped[str] = mapped_column(String(32), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # No FK: the conversation may be purged long before its log.
    conversation_id: Mapped[int | None] = mapped_column(nullable=True)
    kind: Mapped[str] = mapped_column(String(20))  # "chat" or "connection_test"
    status: Mapped[str] = mapped_column(String(10))  # "ok" or "error"
    provider: Mapped[str | None] = mapped_column(String(30), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    question: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int] = mapped_column(default=0)
    llm_calls: Mapped[int] = mapped_column(default=0)
    tool_calls: Mapped[int] = mapped_column(default=0)
    prompt_tokens: Mapped[int] = mapped_column(default=0)
    completion_tokens: Mapped[int] = mapped_column(default=0)
    trace: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)

    user: Mapped["User"] = relationship()  # noqa: F821
