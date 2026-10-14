"""Assistente Cartuga: conversations, retention and the tool-calling loop.

One user turn:
1. purge history older than ASSISTANT_HISTORY_DAYS and check the hourly limit;
2. send the system prompt + the last few visible messages + the question to the
   model, with the tool schemas;
3. run every tool the model asks for (deterministic, read-only, scoped to the user)
   and send the results back - up to MAX_TOOL_ROUNDS times;
4. check the final answer's R$ amounts against the tool results (grounding.py) and
   attach the fixed caution notice when a decision-support tool was used;
5. store the question and the answer (with its sources). If the model fails, nothing
   is stored in the chat, so the user can just send the question again;
6. either way, log the whole turn for administrators (audit.py).
"""

import json
import logging
from collections import Counter
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.assistant import audit, grounding, privacy, tools, trace_text
from app.assistant.llm import LLMClient, LLMError
from app.assistant.prompt import build_system_prompt
from app.assistant.trace import MAX_REASONING_CHARS, Tracer, attempt_rows, clip, for_user
from app.config import get_settings
from app.models.assistant import ChatConversation, ChatMessage
from app.models.enums import ChatRole
from app.models.user import User
from app.utils.errors import AppError, NotFoundError, ValidationAppError

logger = logging.getLogger("cartuga.assistant")

MAX_TOOL_ROUNDS = 5
HISTORY_MESSAGES = 8
MAX_QUESTION_CHARS = 1000
MAX_TOOL_RESULT_CHARS = 6000
DEFAULT_TITLE = "Nova conversa"


class AssistantUnavailableError(AppError):
    status_code = 503
    code = "ASSISTANT_UNAVAILABLE"


class RateLimitedError(AppError):
    status_code = 429
    code = "RATE_LIMITED"


# ---- retention ---------------------------------------------------------------------


def _db_now(db: Session) -> datetime:
    # created_at is stamped by the database (server_default=now()), so windows are
    # measured on the database clock too - never mixed with the app container's.
    return db.execute(select(func.now())).scalar()


def purge_expired(db: Session, user_id: int) -> None:
    """Deletes this user's messages older than the retention window, then any
    conversation left empty. Runs lazily on every assistant request - no scheduler
    needed, and an expired message can never be served."""
    cutoff = _db_now(db) - timedelta(days=get_settings().assistant_history_days)
    conversation_ids = [c.id for c in db.query(ChatConversation.id).filter(ChatConversation.user_id == user_id)]
    if not conversation_ids:
        return
    db.query(ChatMessage).filter(
        ChatMessage.conversation_id.in_(conversation_ids), ChatMessage.created_at < cutoff
    ).delete(synchronize_session=False)
    non_empty = db.query(ChatMessage.conversation_id).filter(ChatMessage.conversation_id.in_(conversation_ids))
    db.query(ChatConversation).filter(
        ChatConversation.user_id == user_id,
        ChatConversation.created_at < cutoff,
        ChatConversation.id.notin_(non_empty),
    ).delete(synchronize_session=False)
    db.commit()


def messages_sent_last_hour(db: Session, user_id: int) -> int:
    since = _db_now(db) - timedelta(hours=1)
    return (
        db.query(func.count(ChatMessage.id))
        .join(ChatConversation, ChatMessage.conversation_id == ChatConversation.id)
        .filter(ChatConversation.user_id == user_id, ChatMessage.role == ChatRole.USER, ChatMessage.created_at >= since)
        .scalar()
    )


# ---- conversations -------------------------------------------------------------------


def list_conversations(db: Session, user_id: int) -> list[ChatConversation]:
    purge_expired(db, user_id)
    return (
        db.query(ChatConversation)
        .filter(ChatConversation.user_id == user_id)
        .order_by(ChatConversation.updated_at.desc(), ChatConversation.id.desc())
        .all()
    )


def get_conversation(db: Session, user_id: int, conversation_id: int) -> ChatConversation:
    conversation = (
        db.query(ChatConversation)
        .filter(ChatConversation.id == conversation_id, ChatConversation.user_id == user_id)
        .first()
    )
    if conversation is None:
        raise NotFoundError("Conversa não encontrada.")
    return conversation


def create_conversation(db: Session, user_id: int) -> ChatConversation:
    purge_expired(db, user_id)
    conversation = ChatConversation(user_id=user_id, title=DEFAULT_TITLE)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def delete_conversation(db: Session, user_id: int, conversation_id: int) -> None:
    db.delete(get_conversation(db, user_id, conversation_id))
    db.commit()


def delete_all_conversations(db: Session, user_id: int) -> None:
    for conversation in db.query(ChatConversation).filter(ChatConversation.user_id == user_id).all():
        db.delete(conversation)
    db.commit()


# ---- one turn ----------------------------------------------------------------------------


def _history(conversation: ChatConversation) -> list[dict]:
    # Only the visible text of recent turns - earlier tool results aren't resent (the
    # model calls the tools again if it needs fresh numbers), which keeps every
    # request small for the free tier.
    recent = conversation.messages[-HISTORY_MESSAGES:]
    return [
        {"role": "user" if m.role == ChatRole.USER else "assistant", "content": m.content}
        for m in recent
    ]


def _run_tool(db: Session, user_id: int, name: str, arguments: dict) -> tuple[dict, tools.Tool | None, list[str]]:
    """Runs one tool for `user_id` - which always comes from the authenticated session,
    never from the model. Arguments the tool's schema doesn't declare (say, a
    `user_id` slipped in by a prompt injection) are dropped before the call and
    returned, so the trace shows the attempt."""
    tool = tools.TOOLS_BY_NAME.get(name)
    if tool is None:
        return {"error": f"Ferramenta desconhecida: {name}."}, None, []
    declared = tool.parameters.get("properties", {})
    ignored = [k for k in arguments if k not in declared]
    clean = {k: v for k, v in arguments.items() if k in declared}
    try:
        return tool.run(db, user_id, clean), tool, ignored
    except tools.ToolError as exc:
        return {"error": str(exc)}, tool, ignored
    except Exception:  # never let a tool bug break the whole answer
        logger.exception("assistant tool %s failed", name)
        return {"error": "Não foi possível consultar esses dados agora."}, tool, ignored


def send_message(
    db: Session,
    user: User,
    conversation_id: int,
    text: str,
    client: LLMClient | None,
    *,
    enforce_hourly_limit: bool = True,
    unavailable_reason: str | None = None,
    provider_info: dict | None = None,
) -> ChatMessage:
    """`enforce_hourly_limit` is off for users on their own API key - the limit only
    protects the server's shared quota. Every stage is recorded in a Tracer (see
    trace.py), and every outcome - answer, expected failure or bug - ends up in the
    admin log (audit.py)."""
    question = text.strip()
    if not question:
        raise ValidationAppError("Escreva uma pergunta.")
    if len(question) > MAX_QUESTION_CHARS:
        raise ValidationAppError(f"A pergunta pode ter no máximo {MAX_QUESTION_CHARS} caracteres.")

    provider_info = provider_info or {}
    tracer = Tracer(user.id, conversation_id, user_label=f"{user.name} (#{user.id})")
    log = {
        "user_id": user.id,
        "conversation_id": conversation_id,
        "provider": provider_info.get("provider"),
        "model": provider_info.get("model"),
        "question": question,
    }
    try:
        message, trace = _turn(
            db, user, conversation_id, question, client, tracer, enforce_hourly_limit, unavailable_reason, provider_info
        )
    except AppError as error:
        tracer.step("error", "Falha", message=error.message, code=error.code)
        db.rollback()
        _stored(tracer, audit.save(db, tracer.finish("error"), **log, error=error.message))
        error.message = f"{error.message} (rastreio {tracer.trace_id})"
        raise
    except Exception as exc:
        logger.exception("assistant turn %s failed", tracer.trace_id)
        detail = f"{type(exc).__name__}: {exc}"
        tracer.step("error", "Erro inesperado", message="Erro interno do servidor.", exception=detail)
        db.rollback()
        _stored(tracer, audit.save(db, tracer.finish("error"), **log, error=detail))
        raise
    _stored(tracer, audit.save(db, trace, **log, answer=message.content))
    return message


def _stored(tracer: Tracer, log_id: int | None) -> None:
    if log_id is not None:
        tracer.note(f"registrado em Gerenciamento → Logs do Assistente (registro #{log_id})")


def _turn(
    db: Session,
    user: User,
    conversation_id: int,
    question: str,
    client: LLMClient | None,
    tracer: Tracer,
    enforce_hourly_limit: bool,
    unavailable_reason: str | None,
    provider_info: dict,
) -> tuple[ChatMessage, dict]:
    settings = get_settings()
    used = messages_sent_last_hour(db, user.id)
    tracer.step(
        "request",
        "Pergunta recebida",
        question=question,
        question_chars=len(question),
        provider=provider_info,
        hourly_limit={
            "enforced": enforce_hourly_limit,
            "used_last_hour": used,
            "max": settings.assistant_max_messages_per_hour if enforce_hourly_limit else None,
        },
    )

    if client is None:
        raise AssistantUnavailableError(unavailable_reason or "O assistente não está configurado.")

    purge_expired(db, user.id)
    if enforce_hourly_limit and used >= settings.assistant_max_messages_per_hour:
        raise RateLimitedError(
            f"Você chegou ao limite de {settings.assistant_max_messages_per_hour} perguntas por hora. "
            "Tente de novo daqui a pouco."
        )
    conversation = get_conversation(db, user.id, conversation_id)

    system_prompt = build_system_prompt(user.name)
    # Personal identifiers (CPF, card, e-mail...) never leave the server: the provider
    # gets masked copies; the conversation stored here keeps the originals.
    masked: Counter = Counter()

    def mask(text: str) -> str:
        clean, found = privacy.redact(text)
        masked.update(found)
        return clean

    history = [{**m, "content": mask(m["content"])} for m in _history(conversation)]
    messages: list[dict] = [{"role": "system", "content": system_prompt}, *history, {"role": "user", "content": mask(question)}]
    tool_schemas = tools.schemas()
    tracer.step(
        "context",
        "Contexto montado",
        system_prompt_chars=len(system_prompt),
        system_prompt=system_prompt,
        history_messages=len(history),
        history=history,
        tools_offered=[t.name for t in tools.TOOLS],
        max_rounds=MAX_TOOL_ROUNDS,
        redacted=privacy.summary(masked),
    )

    tool_results: list[dict] = []
    sources: list[dict] = []
    caution_tools: list[str] = []
    answer = ""

    try:
        for round_number in range(1, MAX_TOOL_ROUNDS + 1):
            started = tracer.elapsed_ms()
            sent_messages = len(messages)
            tracer.progress(
                f"aguardando o modelo {getattr(client, 'model', '')} (rodada {round_number}, {sent_messages} mensagens, "
                f"{trace_text.num(len(json.dumps(messages, ensure_ascii=False)))} caracteres)"
            )
            reply = client.chat(messages, tool_schemas)
            tracer.step(
                "llm",
                f"Chamada ao modelo #{round_number}",
                round=round_number,
                model=reply.model or getattr(client, "model", ""),
                ms=tracer.elapsed_ms() - started,
                messages_sent=sent_messages,
                attempts=attempt_rows(reply.attempts),
                usage=reply.usage,
                finish_reason=reply.finish_reason,
                outcome="tool_calls" if reply.tool_calls else "answer",
                requested_tools=[{"name": c.name, "arguments": c.arguments} for c in reply.tool_calls],
                reasoning=clip(reply.reasoning, MAX_REASONING_CHARS),
                content=reply.content or None,
            )
            if not reply.tool_calls:
                answer = reply.content.strip()
                break
            messages.append({
                "role": "assistant",
                "content": reply.content or "",
                "tool_calls": [
                    {"id": c.id, "type": "function", "function": {"name": c.name, "arguments": c.raw_arguments}}
                    for c in reply.tool_calls
                ],
            })
            for call in reply.tool_calls:
                started = tracer.elapsed_ms()
                result, tool, ignored = _run_tool(db, user.id, call.name, call.arguments)
                content = json.dumps(result, ensure_ascii=False, default=str)
                # Masked before cutting, so a cut can't leave half a CPF behind.
                masked_content, found = privacy.redact(content)
                sent = masked_content[:MAX_TOOL_RESULT_CHARS]
                tracer.step(
                    "tool",
                    f"Consulta: {tool.label(call.arguments) if tool else call.name}",
                    name=call.name,
                    arguments=call.arguments,
                    ignored_arguments=ignored or None,
                    ms=tracer.elapsed_ms() - started,
                    ok="error" not in result,
                    error=result.get("error"),
                    result_chars=len(content),
                    truncated_for_model=len(masked_content) > MAX_TOOL_RESULT_CHARS,
                    redacted=privacy.summary(found),
                    result=sent,  # exactly what the model got
                )
                tool_results.append(result)
                if tool is not None and "error" not in result:
                    source = {"tool": tool.name, "label": tool.label(call.arguments)}
                    if source not in sources:
                        sources.append(source)
                    if tool.caution and tool.name not in caution_tools:
                        caution_tools.append(tool.name)
                messages.append({"role": "tool", "tool_call_id": call.id, "content": sent})
    except LLMError as exc:
        tracer.step("llm", "Chamada ao modelo falhou", attempts=attempt_rows(exc.attempts), outcome="error")
        raise AssistantUnavailableError(exc.user_message)

    fallback = not answer
    if fallback:
        answer = (
            "Não consegui montar uma resposta confiável para essa pergunta. "
            "Tente reformular ou perguntar uma coisa de cada vez."
        )

    checked = grounding.check_amounts(answer, tool_results, question)
    unverified = [c["amount"] for c in checked if not c["verified"]]
    tracer.step(
        "grounding",
        "Verificação de valores",
        amounts=checked,
        checked=len(checked),
        unverified=len(unverified),
    )
    tracer.step(
        "caution",
        "Aviso de cautela",
        applied=bool(caution_tools),
        because=caution_tools,
    )
    tracer.step(
        "answer",
        "Resposta final" if not fallback else "Resposta padrão (sem resposta do modelo)",
        answer=answer,
        answer_chars=len(answer),
        fallback=fallback,
        sources=len(sources),
    )
    trace = tracer.finish("ok")

    db.add(ChatMessage(conversation_id=conversation.id, role=ChatRole.USER, content=question))
    message = ChatMessage(
        conversation_id=conversation.id,
        role=ChatRole.ASSISTANT,
        content=answer,
        sources=sources,
        flags={"caution": bool(caution_tools), "unverified_amounts": unverified},
        trace=for_user(trace),
    )
    db.add(message)
    if conversation.title == DEFAULT_TITLE:
        conversation.title = question[:80] + ("…" if len(question) > 80 else "")
    conversation.updated_at = _db_now(db)
    db.commit()
    db.refresh(message)
    return message, trace
