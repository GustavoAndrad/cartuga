"""Human-readable terminal rendering of the Assistente's pipeline trace.

What `docker compose logs -f backend` shows while a question is being answered: a
header, one block per step as it happens (with its time since the start), a "waiting
for the model" line before each slow model call, and a closing summary - in plain
Portuguese, with the data inline. Each line starts with the time and the trace id, so
concurrent questions can be told apart (and grepped).

    ═══ ASSISTENTE · pergunta · rastreio 9c3525fe3f24 ══════════════════════════
    12:41:03 [9c3525fe3f24 +0,0 s] 1. Pergunta recebida
          usuário: Ana Souza (#1) · conversa #10
          modelo: ollama · qwen3:1.7b (configuração do próprio usuário)
          pergunta: Quanto eu gastei este mês?
    12:41:03 [9c3525fe3f24 +0,1 s] … aguardando o modelo qwen3:1.7b (rodada 1, 2 mensagens)
    12:42:35 [9c3525fe3f24 +92,1 s] 3. Chamada ao modelo #1 · 92,0 s
          decisão: pediu 1 consulta → list_records(kind=expense, start_date=2026-10-01, ...)
          tokens: 1.939 de entrada + 346 de saída
    ...
    ═══ ✓ CONCLUÍDA em 92,1 s · 2 chamadas ao modelo · 1 consulta · 6.249 tokens ═══

With ASSISTANT_TRACE_LOG=summary the user's content (prompt, question, answer, data,
reasoning, amounts) is replaced by its size; "full" prints it, clipped at
MAX_BLOCK_CHARS per block (the admin log screen always has it complete).
"""

import json
from datetime import datetime

MAX_BLOCK_CHARS = 4000
INDENT = "      "
RULE_WIDTH = 92

SOURCE = {"user": "configuração do próprio usuário", "system": "padrão do servidor", "none": "nenhuma"}
ATTEMPT = {
    "ok": "ok",
    "rate_limited": "limite do provedor atingido",
    "auth_error": "chave recusada",
    "model_not_found": "modelo não encontrado",
    "out_of_memory": "sem memória para o modelo",
    "provider_error": "erro do provedor",
    "timeout": "tempo esgotado",
    "unreachable": "provedor inacessível",
}
KIND = {"chat": "pergunta", "connection_test": "teste de conexão"}
MASKED = {"cpf": "CPF", "cnpj": "CNPJ", "card": "cartão", "email": "e-mail", "phone": "telefone", "pix": "chave Pix"}


def masked_line(redacted: dict | None) -> list[str]:
    if not redacted:
        return []
    items = ", ".join(f"{MASKED.get(k, k)} ({n})" for k, n in redacted.items())
    return [f"🔒 dados pessoais mascarados antes do envio ao modelo: {items}"]


def secs(ms: int | None) -> str:
    if ms is None:
        return "?"
    return f"{ms} ms" if ms < 1000 else f"{ms / 1000:.1f} s".replace(".", ",")


def num(value: int | None) -> str:
    return f"{value or 0:,}".replace(",", ".")


def args(arguments: dict | None) -> str:
    return ", ".join(f"{k}={v}" for k, v in (arguments or {}).items()) or "sem argumentos"


def plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def _block(label: str, text: str) -> list[str]:
    if len(text) > MAX_BLOCK_CHARS:
        text = text[:MAX_BLOCK_CHARS] + f"\n… (+{len(text) - MAX_BLOCK_CHARS} caracteres; completo em Logs do Assistente)"
    return [f"{label}:"] + [f"  │ {line}" for line in text.splitlines() or [""]]


def _pretty(raw: str) -> str:
    try:
        return json.dumps(json.loads(raw), ensure_ascii=False, indent=2)
    except (TypeError, ValueError):
        return raw  # cut for size - shown as the model got it


def _hidden(what: str, chars: int | None = None) -> str:
    size = f"{num(chars)} caracteres, " if chars is not None else ""
    return f"{what}: ({size}oculto - ASSISTANT_TRACE_LOG=summary)"


def rule(text: str) -> str:
    head = f"═══ {text} "
    return head + "═" * max(3, RULE_WIDTH - len(head))


def prefix(trace_id: str, at_ms: int) -> str:
    return f"{datetime.now():%H:%M:%S} [{trace_id} +{secs(at_ms)}]"


def header(kind: str, trace_id: str) -> str:
    return rule(f"ASSISTENTE · {KIND.get(kind, kind)} · rastreio {trace_id}")


def footer(trace: dict) -> str:
    t = trace["totals"]
    parts = [
        plural(t["llm_calls"], "chamada ao modelo", "chamadas ao modelo"),
        plural(t["tool_calls"], "consulta", "consultas"),
    ]
    if t["provider_attempts"] > t["llm_calls"]:
        parts.append(f"{t['provider_attempts']} tentativas ao provedor")
    if t["prompt_tokens"] or t["completion_tokens"]:
        parts.append(f"{num(t['prompt_tokens'])} + {num(t['completion_tokens'])} tokens")
    verdict = "✓ CONCLUÍDA" if trace["status"] == "ok" else "✗ FALHOU"
    return rule(f"{verdict} em {secs(trace['duration_ms'])} · " + " · ".join(parts))


def step_lines(step: dict, full: bool, context: dict) -> list[str]:
    """The detail lines under one step's title. `context` has user/conversation info."""
    s = step
    out: list[str] = []
    kind = s["kind"]

    if kind == "request":
        who = context.get("user_label") or f"#{context.get('user_id')}"
        where = f" · conversa #{context['conversation_id']}" if context.get("conversation_id") else ""
        out.append(f"usuário: {who}{where}")
        p = s.get("provider") or {}
        if p.get("provider") or p.get("model"):
            line = f"modelo: {p.get('provider') or '?'} · {p.get('model') or 'padrão'}"
            if p.get("source"):
                line += f" ({SOURCE.get(p['source'], p['source'])})"
            if p.get("fallback_model"):
                line += f" · reserva: {p['fallback_model']}"
            out.append(line)
        limit = s.get("hourly_limit")
        if limit:
            out.append(
                f"limite por hora: {limit['used_last_hour']} de {limit['max']} perguntas já usadas"
                if limit.get("enforced")
                else "limite por hora: não se aplica (chave própria)"
            )
        if "question" in s:
            out.append(f"pergunta: {s['question']}" if full else _hidden("pergunta", s.get("question_chars")))

    elif kind == "context":
        if "base_url" in s:  # connection test
            p = s.get("provider") or {}
            out.append(f"provedor: {p.get('provider')} · modelo: {p.get('model')} ({SOURCE.get(p.get('source'), p.get('source'))})")
            out.append(f"endereço: {s['base_url']} · {'com' if s.get('has_api_key') else 'sem'} chave de API · tempo limite: {s.get('timeout_seconds')} s")
        else:
            out.append(
                f"histórico enviado: {plural(s.get('history_messages', 0), 'mensagem', 'mensagens')} · "
                f"prompt de sistema: {num(s.get('system_prompt_chars'))} caracteres · até {s.get('max_rounds')} rodadas"
            )
            out.append(f"consultas disponíveis ({len(s.get('tools_offered', []))}): {', '.join(s.get('tools_offered', []))}")
            out += masked_line(s.get("redacted"))
            if full:
                for m in s.get("history") or []:
                    who = "usuário" if m.get("role") == "user" else "assistente"
                    out.append(f"  [{who}] {m.get('content', '')}")
                if s.get("system_prompt"):
                    out += _block("prompt de sistema", s["system_prompt"])

    elif kind == "llm":
        if s.get("outcome") == "error":
            out.append("✗ o provedor não respondeu")
        else:
            out.append(f"modelo: {s.get('model')} · {plural(s.get('messages_sent', 0), 'mensagem enviada', 'mensagens enviadas')}")
            requested = s.get("requested_tools") or []
            if requested:
                calls = "; ".join(f"{t['name']}({args(t.get('arguments'))})" for t in requested)
                out.append(f"decisão: pediu {plural(len(requested), 'consulta', 'consultas')} → {calls}")
            else:
                out.append(f"decisão: escreveu a resposta ({num(len(s.get('content') or ''))} caracteres)")
            usage = s.get("usage") or {}
            if usage:
                out.append(f"tokens: {num(usage.get('prompt_tokens'))} de entrada + {num(usage.get('completion_tokens'))} de saída")
            if s.get("finish_reason") == "length":
                out.append("⚠ resposta cortada no limite de tamanho (finish_reason=length)")
            elif s.get("finish_reason"):
                out.append(f"fim: {s['finish_reason']}")
        attempts = s.get("attempts") or []
        if len(attempts) > 1 or any(a.get("outcome") != "ok" for a in attempts):
            out.append("tentativas ao provedor:")
            for i, a in enumerate(attempts, 1):
                status = f" (HTTP {a['status']})" if a.get("status") else ""
                line = f"  {i}) {a['model']} → {ATTEMPT.get(a['outcome'], a['outcome'])}{status} em {secs(a.get('ms'))}"
                if a.get("detail"):
                    line += f" - {a['detail']}"
                out.append(line)
        if s.get("reasoning"):
            out += _block("raciocínio do modelo", s["reasoning"]) if full else [_hidden("raciocínio do modelo", len(s["reasoning"]))]
        if s.get("content") and requested_or_test(s):
            out += _block("texto do modelo", s["content"]) if full else [_hidden("texto do modelo", len(s["content"]))]

    elif kind == "tool":
        out.append(f"argumentos: {args(s.get('arguments'))}")
        if s.get("ignored_arguments"):
            out.append(f"⚠ argumentos ignorados (não fazem parte da consulta): {', '.join(s['ignored_arguments'])}")
        if not s.get("ok"):
            out.append(f"✗ erro: {s.get('error')}")
        out += masked_line(s.get("redacted"))
        cut = " - cortados para o modelo" if s.get("truncated_for_model") else ""
        if "result" in s and full:
            out += _block(f"dados devolvidos ao modelo ({num(s.get('result_chars'))} caracteres{cut})", _pretty(s["result"]))
        else:
            out.append(_hidden(f"dados devolvidos ao modelo{cut}", s.get("result_chars")))

    elif kind == "grounding":
        if not s.get("checked"):
            out.append("nenhum valor em R$ na resposta")
        elif full and "amounts" in s:
            for a in s["amounts"]:
                out.append(f"{'✓' if a['verified'] else '⚠'} {a['amount']}" + ("" if a["verified"] else " - não encontrado nos dados consultados"))
        else:
            out.append(f"{s['checked']} valores em R$ · {s.get('unverified', 0)} não verificados")

    elif kind == "caution":
        out.append(f"aplicado por causa de: {', '.join(s['because'])}" if s.get("applied") else "não necessário (nenhuma simulação)")

    elif kind == "answer":
        out.append(f"{num(s.get('answer_chars'))} caracteres · {plural(s.get('sources', 0), 'fonte', 'fontes')}")
        if s.get("fallback"):
            out.append("⚠ o modelo não chegou a uma resposta, então foi usada a resposta padrão")
        if "answer" in s:
            out += _block("resposta", s["answer"]) if full else [_hidden("resposta", s.get("answer_chars"))]

    elif kind == "error":
        out.append(f"✗ {s.get('message')}")
        if s.get("exception"):
            out.append(f"exceção: {s['exception']}")

    return out


def requested_or_test(step: dict) -> bool:
    """A model call's text is worth printing when it's not already the answer step's
    (it came with tool calls, or it's a connection test reply)."""
    return bool(step.get("requested_tools")) or step.get("messages_sent") is None


def render_step(step: dict, trace_id: str, full: bool, context: dict) -> str:
    duration = f" · {secs(step['ms'])}" if isinstance(step.get("ms"), int) else ""
    status = ""
    if step["kind"] == "tool":
        status = " · ✓ ok" if step.get("ok") else " · ✗ erro"
    lines = [f"{prefix(trace_id, step['at_ms'])} {step['n']}. {step['title']}{duration}{status}"]
    lines += [f"{INDENT}{line}" for line in step_lines(step, full, context)]
    if step["n"] == 1:
        lines.insert(0, header(context.get("kind", "chat"), trace_id))
    return "\n".join(lines)
