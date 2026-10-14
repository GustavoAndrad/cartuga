"""Gerenciamento → Logs do Assistente: every turn and connection test, complete."""

import httpx
import pytest

from app.assistant import providers
from app.assistant.llm import LLMError, LLMReply, OpenAICompatibleClient
from app.config import get_settings
from app.models.assistant import AssistantLog
from app.models.enums import UserRole
from app.models.user import User
from tests.test_assistant import (  # noqa: F401 - fixtures
    _auth_header,
    _new_conversation,
    _send,
    _ym,
    answer,
    call,
    fake_llm,
    user_with_data,
)

GROQ = {"provider": "groq", "api_key": "gsk_test_1234567890abcd"}


@pytest.fixture()
def admin(user_with_data, db_session):
    """Ana, promoted to administrator: she asks the questions and reads her own logs."""
    db_session.query(User).filter(User.email == "ana@example.com").one().role = UserRole.ADMIN
    db_session.commit()
    return user_with_data


def _logs(client, headers, **params):
    return client.get("/admin/assistant/logs", headers=headers, params=params).json()


def test_answered_turn_is_logged_with_prompt_data_and_timings(client, user_with_data, admin, fake_llm):
    fake_llm(call("get_month_overview", month=_ym(0)), answer("Você gastou R$ 1.450,00."))
    message = _send(client, user_with_data, _new_conversation(client, user_with_data), "Quanto gastei?").json()["message"]

    page = _logs(client, admin)

    assert page["total"] == 1 and page["stats"]["errors"] == 0 and page["stats"]["tool_calls"] == 1
    row = page["items"][0]
    assert row["trace_id"] == message["trace"]["trace_id"]
    assert row["status"] == "ok" and row["kind"] == "chat"
    assert row["question"] == "Quanto gastei?" and row["answer"] == "Você gastou R$ 1.450,00."
    assert row["user"]["email"] == "ana@example.com"

    detail = client.get(f"/admin/assistant/logs/{row['id']}", headers=admin).json()
    steps = {s["kind"]: s for s in detail["trace"]["steps"]}
    assert "Assistente Cartuga" in steps["context"]["system_prompt"]  # the exact prompt sent
    assert steps["context"]["history"] == []
    assert '"expenses_total": "1450.00"' in steps["tool"]["result"]  # the data consulted
    assert all("at_ms" in s for s in detail["trace"]["steps"])


def test_the_user_sees_the_trace_without_the_system_prompt(client, user_with_data, fake_llm):
    fake_llm(answer("Olá!"))
    message = _send(client, user_with_data, _new_conversation(client, user_with_data), "Oi").json()["message"]

    context = next(s for s in message["trace"]["steps"] if s["kind"] == "context")
    assert "system_prompt" not in context and context["system_prompt_chars"] > 0


def test_failed_turn_is_logged_with_the_provider_detail(client, user_with_data, admin, fake_llm):
    from app.assistant.llm import Attempt

    fake_llm(LLMError("Não consegui conectar ao Ollama.", [Attempt("qwen3:8b", "unreachable", None, 12, "ConnectError: Name or service not known")]))
    response = _send(client, user_with_data, _new_conversation(client, user_with_data), "Oi")
    assert response.status_code == 503

    row = _logs(client, admin, status="error")["items"][0]
    assert row["error"] == "Não consegui conectar ao Ollama."
    assert row["question"] == "Oi" and row["answer"] is None
    trace = client.get(f"/admin/assistant/logs/{row['id']}", headers=admin).json()["trace"]
    failed = next(s for s in trace["steps"] if s["kind"] == "llm")
    assert failed["attempts"][0]["detail"] == "ConnectError: Name or service not known"


def test_unexpected_errors_are_logged_too(client, user_with_data, admin, fake_llm, db_session):
    fake_llm(RuntimeError("boom"))
    with pytest.raises(RuntimeError):
        _send(client, user_with_data, _new_conversation(client, user_with_data), "Oi")

    log = db_session.query(AssistantLog).one()
    assert log.status == "error" and log.error == "RuntimeError: boom"


def test_connection_tests_are_logged(client, user_with_data, admin, monkeypatch):
    def failing_chat(self, messages, tools):
        raise LLMError("A chave de API do assistente é inválida.")

    monkeypatch.setattr(OpenAICompatibleClient, "chat", failing_chat)
    result = client.post("/assistant/settings/test", headers=user_with_data, json=GROQ).json()

    row = _logs(client, admin, kind="connection_test")["items"][0]
    assert result["ok"] is False and f"(rastreio {row['trace_id']})" in result["message"]
    assert row["provider"] == "groq" and row["error"] == "A chave de API do assistente é inválida."
    trace = client.get(f"/admin/assistant/logs/{row['id']}", headers=admin).json()["trace"]
    context = next(s for s in trace["steps"] if s["kind"] == "context")
    assert context["base_url"] == "https://api.groq.com/openai/v1" and context["has_api_key"] is True
    assert GROQ["api_key"] not in str(trace)  # never the key itself


def test_logs_can_be_searched_and_filtered(client, user_with_data, admin, fake_llm):
    conversation = _new_conversation(client, user_with_data)
    fake_llm(answer("Olá!"), answer("Tudo bem."))
    _send(client, user_with_data, conversation, "Oi")
    _send(client, user_with_data, conversation, "Como vai a reserva?")

    assert _logs(client, admin)["total"] == 2
    assert [r["question"] for r in _logs(client, admin, search="reserva")["items"]] == ["Como vai a reserva?"]
    assert _logs(client, admin, status="error")["total"] == 0


def test_regular_users_cannot_open_the_logs_screen(client, admin, make_user):
    make_user(email="beto@example.com", password="Sfort3!123")
    beto = _auth_header(client, "beto@example.com")

    assert client.get("/admin/assistant/logs", headers=beto).status_code == 403
    assert client.get("/admin/assistant/logs/1", headers=beto).status_code == 403
    assert client.delete("/admin/assistant/logs", headers=beto).status_code == 403


def test_each_admin_sees_only_their_own_logs(client, admin, make_user, fake_llm):
    make_user(email="bia@example.com", password="Sfort3!123", role=UserRole.ADMIN, name="Bia")
    bia = _auth_header(client, "bia@example.com")
    fake_llm(answer("Olá, Ana!"), answer("Olá, Bia!"))
    anas_trace = _send(client, admin, _new_conversation(client, admin), "Pergunta da Ana").json()["message"]["trace"]["trace_id"]
    _send(client, bia, _new_conversation(client, bia), "Pergunta da Bia")
    anas_id = _logs(client, admin)["items"][0]["id"]

    page = _logs(client, bia)
    assert [r["question"] for r in page["items"]] == ["Pergunta da Bia"] and page["stats"]["total"] == 1
    assert _logs(client, bia, search=anas_trace)["total"] == 0
    assert _logs(client, bia, search="Ana")["total"] == 0
    assert client.get(f"/admin/assistant/logs/{anas_id}", headers=bia).status_code == 404  # not even "it exists"
    # Filtering by someone else isn't possible at all: the parameter doesn't exist.
    assert _logs(client, bia, user_id=1)["total"] == 1

    assert client.delete("/admin/assistant/logs", headers=bia).status_code == 204
    assert _logs(client, bia)["total"] == 0
    assert [r["question"] for r in _logs(client, admin)["items"]] == ["Pergunta da Ana"]  # untouched


def test_logging_can_be_turned_off(client, user_with_data, admin, fake_llm, monkeypatch):
    monkeypatch.setattr(get_settings(), "assistant_log_days", 0)
    fake_llm(answer("Olá!"))
    _send(client, user_with_data, _new_conversation(client, user_with_data), "Oi")

    assert _logs(client, admin)["total"] == 0


# ---- terminal: readable, live --------------------------------------------------------------


@pytest.fixture()
def terminal(monkeypatch):
    """Captures what the trace logger prints, in the default text format."""
    import io

    from app.assistant import trace as trace_module

    monkeypatch.setattr(get_settings(), "assistant_trace_format", "text")
    stream = io.StringIO()
    handler = trace_module.logger.handlers[0]
    previous = handler.setStream(stream)
    yield stream.getvalue
    handler.setStream(previous)


def test_terminal_tells_the_whole_story_readably(client, admin, fake_llm, terminal, monkeypatch):
    monkeypatch.setattr(get_settings(), "assistant_trace_log", "full")
    fake_llm(call("get_month_overview", month=_ym(0), user_id=99), answer("Você gastou R$ 1.450,00 e R$ 7,00."))

    message = _send(client, admin, _new_conversation(client, admin), "Quanto gastei?").json()["message"]

    out = terminal()
    trace_id = message["trace"]["trace_id"]
    assert f"ASSISTENTE · pergunta · rastreio {trace_id}" in out
    lines = [line for line in out.splitlines() if line.strip()]
    assert all(f"[{trace_id} +" in line or line.startswith(("═══", "      ")) for line in lines)
    for expected in (
        "1. Pergunta recebida",
        "usuário: Ana Souza",
        "pergunta: Quanto gastei?",
        "… aguardando o modelo fake (rodada 1, 2 mensagens",
        "3. Chamada ao modelo #1",
        f"decisão: pediu 1 consulta → get_month_overview(month={_ym(0)}, user_id=99)",
        "Consulta: Resumo de",
        "⚠ argumentos ignorados (não fazem parte da consulta): user_id",
        '"expenses_total": "1450.00"',  # the data, pretty-printed
        "✓ R$ 1.450,00",
        "⚠ R$ 7,00 - não encontrado nos dados consultados",
        "Você gastou R$ 1.450,00",
        "prompt de sistema:",
        "✓ CONCLUÍDA em",
        "registrado em Gerenciamento → Logs do Assistente (registro #",
    ):
        assert expected in out, expected
    assert out.index("Pergunta recebida") < out.index("aguardando o modelo") < out.index("Chamada ao modelo #1") < out.index("CONCLUÍDA")
    assert not out.lstrip().startswith("{")  # not JSON


def test_terminal_summary_mode_hides_the_users_content(client, admin, fake_llm, terminal, monkeypatch):
    monkeypatch.setattr(get_settings(), "assistant_trace_log", "summary")
    fake_llm(call("get_month_overview", month=_ym(0)), answer("Você gastou R$ 1.450,00."))

    _send(client, admin, _new_conversation(client, admin), "Pergunta secreta?")

    out = terminal()
    assert "Pergunta secreta" not in out and "1450.00" not in out and "1.450,00" not in out
    assert "pergunta: (17 caracteres, oculto - ASSISTANT_TRACE_LOG=summary)" in out
    assert "get_month_overview" in out and "✓ CONCLUÍDA" in out


def test_terminal_shows_failures_with_the_technical_reason(client, admin, fake_llm, terminal):
    from app.assistant.llm import Attempt

    fake_llm(LLMError("Não consegui conectar ao Ollama.", [Attempt("qwen3:8b", "unreachable", None, 12, "ConnectError: Name or service not known")]))
    _send(client, admin, _new_conversation(client, admin), "Oi")

    out = terminal()
    assert "1) qwen3:8b → provedor inacessível em 12 ms - ConnectError: Name or service not known" in out
    assert "✗ Não consegui conectar ao Ollama." in out
    assert "✗ FALHOU em" in out


def test_terminal_shows_connection_tests(client, admin, terminal, monkeypatch):
    def fake_chat(self, messages, tools):
        return LLMReply(content="ok", model=self.models[0])

    monkeypatch.setattr(OpenAICompatibleClient, "chat", fake_chat)
    client.post("/assistant/settings/test", headers=admin, json=GROQ)

    out = terminal()
    assert "ASSISTENTE · teste de conexão" in out
    assert "endereço: https://api.groq.com/openai/v1 · com chave de API · tempo limite: 20 s" in out
    assert "… aguardando o modelo openai/gpt-oss-120b" in out and "✓ CONCLUÍDA" in out
    assert GROQ["api_key"] not in out


# ---- Ollama -------------------------------------------------------------------------------


def test_ollama_url_comes_from_its_own_setting_for_everyone(client, user_with_data, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "assistant_provider", "groq")
    monkeypatch.setattr(settings, "assistant_ollama_url", "http://host.docker.internal:11434/v1")
    seen = {}

    def fake_chat(self, messages, tools):
        seen["base_url"] = self.base_url
        return LLMReply(content="ok", model=self.models[0])

    monkeypatch.setattr(OpenAICompatibleClient, "chat", fake_chat)
    result = client.post("/assistant/settings/test", headers=user_with_data, json={"provider": "ollama", "model": "qwen3:1.7b"}).json()

    assert result["ok"] is True
    assert seen["base_url"] == "http://host.docker.internal:11434/v1"
    config, _ = providers.system_config(settings.model_copy(update={"assistant_provider": "ollama"}))
    assert config.base_url == "http://host.docker.internal:11434/v1"


def _ollama(monkeypatch, outcome):
    def fake_post(url, **kwargs):
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(httpx, "post", fake_post)
    return OpenAICompatibleClient("http://ollama:11434/v1", "", ["qwen3:8b"], 5, provider="ollama")


@pytest.mark.parametrize(
    "outcome, kind, hint",
    [
        (httpx.ConnectError("Name or service not known"), "unreachable", "docker compose --profile ollama up -d"),
        (httpx.Response(404, json={"error": {"message": 'model "qwen3:8b" not found, try pulling it first'}}), "model_not_found", "ollama pull qwen3:8b"),
        (httpx.Response(500, json={"error": {"message": "model requires more system memory (5.6 GiB) than is available (3.1 GiB)"}}), "out_of_memory", "modelo menor"),
        (httpx.ReadTimeout("timed out"), "timeout", "modelo menor"),
    ],
)
def test_ollama_failures_say_what_to_do(monkeypatch, outcome, kind, hint):
    client = _ollama(monkeypatch, outcome)

    with pytest.raises(LLMError) as raised:
        client.chat([{"role": "user", "content": "oi"}], [])

    assert hint in raised.value.user_message
    assert raised.value.attempts[0].outcome == kind and raised.value.attempts[0].detail


def test_ollama_models_answer_without_thinking(monkeypatch):
    sent = {}

    def fake_post(url, json, **kwargs):
        sent.update(json)
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}]})

    monkeypatch.setattr(httpx, "post", fake_post)
    OpenAICompatibleClient("http://ollama:11434/v1", "", ["qwen3:1.7b"], 5, provider="ollama").chat([], [])
    assert sent["reasoning_effort"] == "none"

    sent.clear()
    OpenAICompatibleClient("https://api.groq.com/openai/v1", "k", ["openai/gpt-oss-120b"], 5, provider="groq").chat([], [])
    assert "reasoning_effort" not in sent
