from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.assistant import providers, service, user_settings
from app.assistant.llm import LLMClient, build_client
from app.auth.dependencies import get_current_user
from app.config import get_settings
from app.database.session import get_db
from app.models.user import User
from app.schemas.assistant import (
    AssistantSettingsIn,
    AssistantSettingsOut,
    AssistantStatusOut,
    ChatConversationDetailOut,
    ChatConversationOut,
    ChatMessageIn,
    ChatTurnOut,
    ConnectionTestOut,
)

# Any role. Every endpoint only ever touches the caller's own conversations, settings and data.
router = APIRouter(prefix="/assistant", tags=["assistant"])


def get_resolution(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> providers.Resolution:
    return providers.resolve(db, current_user.id, get_settings())


def get_llm_client(resolution: providers.Resolution = Depends(get_resolution)) -> LLMClient | None:
    """The user's own model if configured, else the server default. Overridable in
    tests (a scripted fake model)."""
    if resolution.config is None:
        return None
    return build_client(resolution.config, get_settings().assistant_timeout_seconds)


@router.get("/status", response_model=AssistantStatusOut)
def get_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    resolution: providers.Resolution = Depends(get_resolution),
):
    settings = get_settings()
    used = service.messages_sent_last_hour(db, current_user.id)
    limited = resolution.source != "user"
    return {
        "enabled": resolution.config is not None,
        "reason": resolution.reason,
        "source": resolution.source,
        "provider": resolution.config.provider if resolution.config else "",
        "model": resolution.config.model if resolution.config else "",
        "history_days": settings.assistant_history_days,
        "max_messages_per_hour": settings.assistant_max_messages_per_hour if limited else None,
        "remaining_this_hour": max(0, settings.assistant_max_messages_per_hour - used) if limited else None,
    }


@router.get("/settings", response_model=AssistantSettingsOut)
def get_assistant_settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_settings.view(db, current_user.id)


@router.put("/settings", response_model=AssistantSettingsOut)
def save_assistant_settings(
    payload: AssistantSettingsIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return user_settings.save(db, current_user.id, payload)


@router.post("/settings/test", response_model=ConnectionTestOut)
def test_assistant_settings(
    payload: AssistantSettingsIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return user_settings.test_connection(db, current_user.id, payload)


@router.get("/conversations", response_model=list[ChatConversationOut])
def list_conversations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return service.list_conversations(db, current_user.id)


@router.post("/conversations", response_model=ChatConversationOut, status_code=201)
def create_conversation(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return service.create_conversation(db, current_user.id)


@router.get("/conversations/{conversation_id}", response_model=ChatConversationDetailOut)
def get_conversation(conversation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    service.purge_expired(db, current_user.id)
    return service.get_conversation(db, current_user.id, conversation_id)


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    service.delete_conversation(db, current_user.id, conversation_id)


@router.delete("/conversations", status_code=204)
def delete_all_conversations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    service.delete_all_conversations(db, current_user.id)


@router.post("/conversations/{conversation_id}/messages", response_model=ChatTurnOut)
def send_message(
    conversation_id: int,
    payload: ChatMessageIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    resolution: providers.Resolution = Depends(get_resolution),
    client: LLMClient | None = Depends(get_llm_client),
):
    # Plain `def`: FastAPI runs it in the threadpool, so a slow model call never
    # blocks the event loop for other requests.
    message = service.send_message(
        db,
        current_user,
        conversation_id,
        payload.content,
        client,
        enforce_hourly_limit=resolution.source != "user",
        unavailable_reason=resolution.reason,
        provider_info={
            "source": resolution.source,
            "provider": resolution.config.provider if resolution.config else None,
            "model": resolution.config.model if resolution.config else None,
            "fallback_model": (resolution.config.fallback_model or None) if resolution.config else None,
        },
    )
    return {"message": message, "conversation": service.get_conversation(db, current_user.id, conversation_id)}
