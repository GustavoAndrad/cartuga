"""Step-by-step trace of one Assistente turn.

Every stage of the pipeline (request, context, each model call, each tool run, the
amount check, the caution notice, the answer or the failure) becomes a step with its
timing and details. The trace goes to three places, linked by `trace_id`:

- the assistant message itself (`chat_messages.trace`), shown in the chat as
  "Raciocínio" - the user's own data in the user's own history (expires with
  it after 7 days); only the system prompt is left out (for_user());
- the admin log (`assistant_logs`, see audit.py): every turn - answered, failed or a
  connection test - complete, for Gerenciamento → Logs do Assistente;
- the backend's stdout (logger `cartuga.assistant.trace`), live, step by step as they
  happen: readable text by default (trace_text.py), or one JSON line per step with
  ASSISTANT_TRACE_FORMAT=json (for log tools). With ASSISTANT_TRACE_LOG=summary
  (default) it carries the pipeline's shape (steps, timings, tokens, tools,
  arguments, counts, errors) but not the prompt, question, answer, returned data or
  the model's reasoning; "full" prints everything, "off" nothing.
"""

import json
import logging
import sys
import time
import uuid
from datetime import datetime, timezone

from app.assistant import trace_text
from app.config import get_settings

logger = logging.getLogger("cartuga.assistant.trace")
if not logger.handlers:
    # uvicorn only configures its own loggers - give this one a plain stdout handler
    # so the trace shows up in `docker compose logs backend`.
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False

# Fields carrying the user's content - only logged to stdout in "full" mode.
SENSITIVE_FIELDS = {"question", "answer", "result", "reasoning", "content", "amounts", "system_prompt", "history"}
# Fields only the admin log keeps - not shown to the user in "Raciocínio".
ADMIN_ONLY_FIELDS = {"system_prompt"}
MAX_REASONING_CHARS = 4000


class Tracer:
    def __init__(self, user_id: int, conversation_id: int | None, kind: str = "chat", user_label: str = ""):
        self.trace_id = uuid.uuid4().hex[:12]
        self.user_id = user_id
        self.conversation_id = conversation_id
        self.kind = kind  # "chat" or "connection_test"
        self.started_at = datetime.now(timezone.utc)
        self._t0 = time.perf_counter()
        self.steps: list[dict] = []
        settings = get_settings()
        self.mode = settings.assistant_trace_log
        self.text = settings.assistant_trace_format != "json"
        self.user_label = user_label or f"#{user_id}"

    def elapsed_ms(self) -> int:
        return int((time.perf_counter() - self._t0) * 1000)

    def step(self, kind: str, title: str, **data) -> dict:
        entry = {"n": len(self.steps) + 1, "kind": kind, "title": title, "at_ms": self.elapsed_ms(), **data}
        self.steps.append(entry)
        if self.text:
            self._print(trace_text.render_step(entry, self.trace_id, self.mode == "full", self._context()))
        else:
            self._log("assistant.step", step=entry)
        return entry

    def progress(self, text: str) -> None:
        """A live "this is happening now" line (e.g. before a slow model call). Terminal
        text only - not part of the stored trace."""
        if self.text:
            self._print(f"{trace_text.prefix(self.trace_id, self.elapsed_ms())} … {text}")

    def note(self, text: str) -> None:
        """A line after the trace is finished (e.g. where it was stored). Text only."""
        if self.text:
            self._print(f"{trace_text.prefix(self.trace_id, self.elapsed_ms())} {text}")

    def _context(self) -> dict:
        return {
            "kind": self.kind,
            "user_id": self.user_id,
            "user_label": self.user_label,
            "conversation_id": self.conversation_id,
        }

    def _print(self, text: str) -> None:
        if self.mode != "off":
            logger.info(text)

    def finish(self, status: str) -> dict:
        llm_steps = [s for s in self.steps if s["kind"] == "llm"]
        usage = [s.get("usage") or {} for s in llm_steps]
        trace = {
            "trace_id": self.trace_id,
            "kind": self.kind,
            "status": status,
            "started_at": self.started_at.isoformat(),
            "duration_ms": self.elapsed_ms(),
            "totals": {
                "llm_calls": len(llm_steps),
                "provider_attempts": sum(len(s.get("attempts", [])) for s in llm_steps),
                "tool_calls": sum(1 for s in self.steps if s["kind"] == "tool"),
                "prompt_tokens": sum(u.get("prompt_tokens") or 0 for u in usage),
                "completion_tokens": sum(u.get("completion_tokens") or 0 for u in usage),
            },
            "steps": self.steps,
        }
        if self.text:
            self._print(trace_text.footer(trace))
        else:
            self._log("assistant.trace", status=status, duration_ms=trace["duration_ms"], totals=trace["totals"])
        return trace

    def _log(self, event: str, **payload) -> None:
        if self.mode == "off":
            return
        if self.mode != "full" and "step" in payload:
            payload["step"] = {k: v for k, v in payload["step"].items() if k not in SENSITIVE_FIELDS}
        record = {
            "event": event,
            "kind": self.kind,
            "trace_id": self.trace_id,
            "user_id": self.user_id,
            "conversation_id": self.conversation_id,
            **payload,
        }
        logger.info(json.dumps(record, ensure_ascii=False, default=str))


def attempt_rows(attempts) -> list[dict]:
    """The provider attempts (llm.Attempt) behind one model call."""
    return [{"model": a.model, "outcome": a.outcome, "status": a.status, "ms": a.ms, "detail": a.detail} for a in attempts]


def for_user(trace: dict) -> dict:
    """The trace as the user sees it in their own chat."""
    return {**trace, "steps": [{k: v for k, v in s.items() if k not in ADMIN_ONLY_FIELDS} for s in trace["steps"]]}


def clip(text: str | None, limit: int) -> str | None:
    if text is None:
        return None
    return text if len(text) <= limit else text[:limit] + f"… (+{len(text) - limit} caracteres)"
