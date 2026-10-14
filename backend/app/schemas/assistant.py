from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ChatRole


class AssistantStatusOut(BaseModel):
    enabled: bool
    # Why it's disabled (shown in the chat instead of the input), when it is.
    reason: str | None
    # "user" (their own key/model), "system" (server default) or "none".
    source: str
    provider: str
    model: str
    history_days: int
    # Only when on the server's shared quota - None for users on their own key.
    max_messages_per_hour: int | None
    remaining_this_hour: int | None


class ChatSourceOut(BaseModel):
    tool: str
    label: str


class ChatFlagsOut(BaseModel):
    caution: bool = False
    unverified_amounts: list[str] = []


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: ChatRole
    content: str
    sources: list[ChatSourceOut] | None = None
    flags: ChatFlagsOut | None = None
    # Step-by-step pipeline trace (assistant answers only) - see assistant/trace.py.
    trace: dict | None = None
    created_at: datetime


class ChatConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    created_at: datetime
    updated_at: datetime


class ChatConversationDetailOut(ChatConversationOut):
    messages: list[ChatMessageOut]


class ChatMessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=1000)


class ChatTurnOut(BaseModel):
    """The answer just generated, plus the conversation's (possibly new) title."""

    message: ChatMessageOut
    conversation: ChatConversationOut


class ProviderOptionOut(BaseModel):
    key: str
    label: str
    default_model: str
    models: list[str]
    needs_key: bool
    custom_url: bool
    key_url: str | None


class SystemDefaultOut(BaseModel):
    available: bool
    provider: str
    model: str


class AssistantSettingsOut(BaseModel):
    # "system" = use the server's default; otherwise the user's own provider.
    provider: str
    model: str | None
    base_url: str | None
    has_api_key: bool
    # Last 4 characters only - the key itself is never sent back.
    api_key_hint: str | None
    system_default: SystemDefaultOut
    providers: list[ProviderOptionOut]


class AssistantSettingsIn(BaseModel):
    provider: str
    model: str | None = Field(default=None, max_length=120)
    base_url: str | None = Field(default=None, max_length=255)
    # None = keep the saved key; "" = remove it; anything else = replace it.
    api_key: str | None = Field(default=None, max_length=500)


class ConnectionTestOut(BaseModel):
    ok: bool
    message: str
    model: str | None = None


# ---- admin: Logs do Assistente ------------------------------------------------------------


class AssistantLogUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str


class AssistantLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    trace_id: str
    user: AssistantLogUserOut
    conversation_id: int | None
    kind: str
    status: str
    provider: str | None
    model: str | None
    question: str | None
    answer: str | None
    error: str | None
    duration_ms: int
    llm_calls: int
    tool_calls: int
    prompt_tokens: int
    completion_tokens: int
    created_at: datetime


class AssistantLogDetailOut(AssistantLogOut):
    # Complete, including the system prompt - see assistant/audit.py.
    trace: dict


class AssistantLogStatsOut(BaseModel):
    total: int
    errors: int
    avg_duration_ms: int
    max_duration_ms: int
    prompt_tokens: int
    completion_tokens: int
    tool_calls: int


class AssistantLogPageOut(BaseModel):
    items: list[AssistantLogOut]
    total: int
    stats: AssistantLogStatsOut
    retention_days: int
