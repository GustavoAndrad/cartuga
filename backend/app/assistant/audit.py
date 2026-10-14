"""Complete per-turn logs of the Assistente, for administrators.

Every turn - answered, failed (provider down, rate limit, someone else's conversation,
an unexpected bug) - and every connection test from Perfil → Assistente is stored here
with its full trace (trace.py): the exact system prompt and history sent, each model
call with its tokens, attempts and reasoning, every tool with its arguments and the
exact data it returned, the amount check, the answer or the error, and all timings.

Read through Gerenciamento → Logs do Assistente (routers/assistant_admin.py) -
administrators only, and each administrator only ever reaches their OWN records
(every read and delete here is scoped by `owner_id`): being admin doesn't open other
users' questions or financial data. Kept for ASSISTANT_LOG_DAYS (0 = not stored),
purged lazily on each write.

Writing a log never breaks the turn it describes: any failure here is only logged.
"""

import logging
from datetime import timedelta

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.config import get_settings
from app.models.assistant import AssistantLog
from app.utils.errors import NotFoundError

logger = logging.getLogger("cartuga.assistant")

MAX_LIST_LIMIT = 100


def save(
    db: Session,
    trace: dict,
    *,
    user_id: int,
    conversation_id: int | None = None,
    provider: str | None = None,
    model: str | None = None,
    question: str | None = None,
    answer: str | None = None,
    error: str | None = None,
) -> int | None:
    """Returns the new log's id (None when not stored)."""
    days = get_settings().assistant_log_days
    if days <= 0:
        return None
    totals = trace.get("totals", {})
    try:
        cutoff = db.execute(select(func.now())).scalar() - timedelta(days=days)
        db.query(AssistantLog).filter(AssistantLog.created_at < cutoff).delete(synchronize_session=False)
        log = AssistantLog(
                trace_id=trace["trace_id"],
                user_id=user_id,
                conversation_id=conversation_id,
                kind=trace.get("kind", "chat"),
                status=trace["status"],
                provider=provider,
                model=model,
                question=question,
                answer=answer,
                error=error,
                duration_ms=trace.get("duration_ms", 0),
                llm_calls=totals.get("llm_calls", 0),
                tool_calls=totals.get("tool_calls", 0),
                prompt_tokens=totals.get("prompt_tokens", 0),
                completion_tokens=totals.get("completion_tokens", 0),
                trace=trace,
        )
        db.add(log)
        db.commit()
        return log.id
    except Exception:
        db.rollback()
        logger.exception("could not store assistant log %s", trace.get("trace_id"))
        return None


def _filtered(db: Session, owner_id: int, *, status: str | None, kind: str | None, search: str | None):
    query = db.query(AssistantLog).filter(AssistantLog.user_id == owner_id)
    if status:
        query = query.filter(AssistantLog.status == status)
    if kind:
        query = query.filter(AssistantLog.kind == kind)
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            or_(
                AssistantLog.trace_id == search.strip(),
                AssistantLog.question.like(like),
                AssistantLog.answer.like(like),
                AssistantLog.error.like(like),
            )
        )
    return query


def list_logs(
    db: Session,
    owner_id: int,
    *,
    status: str | None = None,
    kind: str | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    query = _filtered(db, owner_id, status=status, kind=kind, search=search)
    stats = query.with_entities(
        func.count(AssistantLog.id),
        func.sum(case((AssistantLog.status == "error", 1), else_=0)),
        func.avg(AssistantLog.duration_ms),
        func.max(AssistantLog.duration_ms),
        func.sum(AssistantLog.prompt_tokens),
        func.sum(AssistantLog.completion_tokens),
        func.sum(AssistantLog.tool_calls),
    ).one()
    items = (
        query.options(joinedload(AssistantLog.user))
        .order_by(AssistantLog.id.desc())
        .offset(max(0, offset))
        .limit(max(1, min(MAX_LIST_LIMIT, limit)))
        .all()
    )
    total, errors, avg_ms, max_ms, prompt_tokens, completion_tokens, tool_calls = stats
    return {
        "items": items,
        "total": total or 0,
        "stats": {
            "total": total or 0,
            "errors": int(errors or 0),
            "avg_duration_ms": int(avg_ms or 0),
            "max_duration_ms": int(max_ms or 0),
            "prompt_tokens": int(prompt_tokens or 0),
            "completion_tokens": int(completion_tokens or 0),
            "tool_calls": int(tool_calls or 0),
        },
        "retention_days": get_settings().assistant_log_days,
    }


def get_log(db: Session, owner_id: int, log_id: int) -> AssistantLog:
    # Someone else's record is "not found", same as conversations - no existence leak.
    log = (
        db.query(AssistantLog)
        .options(joinedload(AssistantLog.user))
        .filter(AssistantLog.id == log_id, AssistantLog.user_id == owner_id)
        .first()
    )
    if log is None:
        raise NotFoundError("Registro não encontrado.")
    return log


def delete_all(db: Session, owner_id: int) -> None:
    db.query(AssistantLog).filter(AssistantLog.user_id == owner_id).delete(synchronize_session=False)
    db.commit()
