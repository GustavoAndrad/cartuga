"""A user's own Assistente configuration (Perfil → Assistente): view, save, test."""

from sqlalchemy.orm import Session

from app.assistant import audit, providers, secrets
from app.assistant.llm import LLMError, build_client
from app.assistant.trace import Tracer, attempt_rows
from app.config import get_settings
from app.models.assistant import AssistantSettings
from app.models.user import User
from app.schemas.assistant import AssistantSettingsIn
from app.utils.errors import ValidationAppError

TEST_TIMEOUT_SECONDS = 20
TEST_PROMPT = "Responda apenas com a palavra: ok"


def view(db: Session, user_id: int) -> dict:
    settings = get_settings()
    row = db.get(AssistantSettings, user_id)
    system, _ = providers.system_config(settings)
    key_hint = None
    if row and row.api_key_encrypted:
        try:
            key_hint = secrets.hint(secrets.decrypt(row.api_key_encrypted))
        except secrets.UnreadableSecretError:
            key_hint = None
    return {
        "provider": row.provider if row else providers.SYSTEM,
        "model": row.model if row else None,
        "base_url": row.base_url if row else None,
        "has_api_key": key_hint is not None,
        "api_key_hint": key_hint,
        "system_default": {
            "available": system is not None,
            "provider": settings.assistant_provider,
            "model": system.model if system else "",
        },
        "providers": [
            {
                "key": key,
                "label": meta["label"],
                "default_model": meta["default_model"],
                "models": meta["models"],
                "needs_key": meta["needs_key"],
                "custom_url": meta["custom_url"],
                "key_url": meta["key_url"],
            }
            for key, meta in providers.PROVIDERS.items()
        ],
    }


def _validated(payload: AssistantSettingsIn) -> tuple[str | None, str | None]:
    """Returns (model, base_url) cleaned up, or raises a user-facing error."""
    meta = providers.PROVIDERS.get(payload.provider)
    if meta is None:
        raise ValidationAppError("Provedor desconhecido.")
    model = (payload.model or "").strip() or None
    if model:
        try:
            providers.check_model(model)
        except providers.InvalidSettingError as exc:
            raise ValidationAppError(str(exc))
    elif not meta["default_model"]:
        raise ValidationAppError("Informe o nome do modelo.")
    base_url = None
    if meta["custom_url"]:
        base_url = (payload.base_url or "").strip().rstrip("/")
        try:
            providers.check_public_https_url(base_url)
        except providers.InvalidSettingError as exc:
            raise ValidationAppError(str(exc))
    return model, base_url


def save(db: Session, user_id: int, payload: AssistantSettingsIn) -> dict:
    row = db.get(AssistantSettings, user_id)
    if payload.provider == providers.SYSTEM:
        # Back to the server default: the user's key isn't kept around unused.
        if row:
            db.delete(row)
            db.commit()
        return view(db, user_id)

    model, base_url = _validated(payload)
    meta = providers.PROVIDERS[payload.provider]
    key = (payload.api_key or "").strip()
    keeps_saved_key = payload.api_key is None and row is not None and row.provider == payload.provider
    # A key belongs to one provider - it's never carried over to another one.
    has_key = bool(key) or (keeps_saved_key and bool(row.api_key_encrypted))
    if meta["needs_key"] and not has_key:
        raise ValidationAppError("Informe a sua chave de API para este provedor.")

    if row is None:
        row = AssistantSettings(user_id=user_id, provider=payload.provider)
        db.add(row)
    if not keeps_saved_key:
        row.api_key_encrypted = secrets.encrypt(key) if key else None
    row.provider = payload.provider
    row.model = model
    row.base_url = base_url
    db.commit()
    return view(db, user_id)


def test_connection(db: Session, user_id: int, payload: AssistantSettingsIn) -> dict:
    """Tries the (possibly unsaved) configuration with a tiny prompt and no tools.
    Traced and logged like a chat turn (kind "connection_test") - when a provider
    can't be reached, the admin log says exactly why."""
    settings = get_settings()
    user = db.get(User, user_id)
    tracer = Tracer(user_id, None, kind="connection_test", user_label=f"{user.name} (#{user_id})" if user else "")
    source = "system" if payload.provider == providers.SYSTEM else "user"
    tracer.step("request", "Teste de conexão", provider={"source": source, "provider": payload.provider, "model": payload.model})

    def done(ok: bool, message: str, config=None, model: str | None = None) -> dict:
        if not ok:
            tracer.step("error", "Falha", message=message)
        trace = tracer.finish("ok" if ok else "error")
        log_id = audit.save(
            db,
            trace,
            user_id=user_id,
            provider=config.provider if config else payload.provider,
            model=config.model if config else payload.model,
            question=TEST_PROMPT,
            answer=message if ok else None,
            error=None if ok else message,
        )
        if log_id is not None:
            tracer.note(f"registrado em Gerenciamento → Logs do Assistente (registro #{log_id})")
        if not ok:
            message = f"{message} (rastreio {tracer.trace_id})"
        return {"ok": ok, "message": message, "model": model}

    if payload.provider == providers.SYSTEM:
        config, reason = providers.system_config(settings)
        if config is None:
            return done(False, reason)
    else:
        model, base_url = _validated(payload)
        row = db.get(AssistantSettings, user_id)
        key = (payload.api_key or "").strip()
        if not key and payload.api_key is None and row and row.provider == payload.provider and row.api_key_encrypted:
            try:
                key = secrets.decrypt(row.api_key_encrypted)
            except secrets.UnreadableSecretError:
                key = ""
        # Transient, never added to the session - just reuses the resolution rules.
        candidate = AssistantSettings(user_id=user_id, provider=payload.provider, model=model, base_url=base_url)
        candidate.api_key_encrypted = secrets.encrypt(key) if key else None
        config, reason = providers.user_config(candidate, settings)
        if config is None:
            return done(False, reason)

    # A local model may first have to be loaded into memory - give it the full timeout.
    timeout = settings.assistant_timeout_seconds if config.provider == "ollama" else TEST_TIMEOUT_SECONDS
    tracer.step(
        "context",
        "Configuração resolvida",
        provider={
            "source": config.source,
            "provider": config.provider,
            "model": config.model,
            "fallback_model": config.fallback_model or None,
        },
        base_url=config.base_url,
        has_api_key=bool(config.api_key),
        timeout_seconds=timeout,
    )
    client = build_client(config, timeout)
    started = tracer.elapsed_ms()
    tracer.progress(f"aguardando o modelo {config.model} em {config.base_url} (até {timeout} s)")
    try:
        reply = client.chat([{"role": "user", "content": TEST_PROMPT}], [])
    except LLMError as exc:
        tracer.step(
            "llm",
            "Chamada ao modelo falhou",
            ms=tracer.elapsed_ms() - started,
            outcome="error",
            attempts=attempt_rows(exc.attempts),
        )
        return done(False, exc.user_message, config)
    tracer.step(
        "llm",
        "Chamada ao modelo #1",
        model=reply.model,
        ms=tracer.elapsed_ms() - started,
        outcome="answer",
        usage=reply.usage,
        finish_reason=reply.finish_reason,
        attempts=attempt_rows(reply.attempts),
        reasoning=reply.reasoning,
        content=reply.content or None,
    )
    return done(True, "Conexão funcionando.", config, reply.model)
