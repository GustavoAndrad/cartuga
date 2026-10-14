import json
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.assistant import grounding, knowledge, tools
from app.assistant import providers, secrets
from app.assistant.llm import LLMError, LLMReply, OpenAICompatibleClient, ToolCall
from app.config import get_settings
from app.main import app as fastapi_app
from app.models.assistant import AssistantSettings, ChatConversation, ChatMessage
from app.models.enums import ChatRole
from app.models.user import User
from app.routers.assistant import get_llm_client
from app.services import finance_engine as fe


def _auth_header(client, email, password="Sfort3!123"):
    response = client.post("/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _month(offset: int) -> tuple[int, int]:
    today = date.today()
    return fe.shift_month(today.year, today.month, offset)


def _ym(offset: int) -> str:
    y, m = _month(offset)
    return f"{y}-{m:02d}"


class FakeLLM:
    """Scripted model: returns the queued replies in order and records what it got."""

    model = "fake"

    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls: list[list[dict]] = []

    def chat(self, messages, tool_schemas):
        self.calls.append([dict(m) for m in messages])
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def call(name, **arguments):
    return LLMReply(
        content="",
        tool_calls=[ToolCall(id=f"c-{name}", name=name, arguments=arguments, raw_arguments=json.dumps(arguments))],
    )


def answer(text):
    return LLMReply(content=text)


@pytest.fixture()
def fake_llm():
    holder = {}

    def install(*replies):
        holder["llm"] = FakeLLM(*replies)
        fastapi_app.dependency_overrides[get_llm_client] = lambda: holder["llm"]
        return holder["llm"]

    yield install
    fastapi_app.dependency_overrides.pop(get_llm_client, None)


@pytest.fixture()
def user_with_data(client, make_user):
    make_user(email="ana@example.com", password="Sfort3!123", name="Ana Souza")
    headers = _auth_header(client, "ana@example.com")
    start = date(*_month(-2), 5)
    client.post("/entries", headers=headers, json={
        "date": start.isoformat(), "start_date": start.isoformat(), "amount": "3000.00",
        "description": "Salário", "source": "Empresa", "type": "FIXED",
    })
    client.post("/expenses", headers=headers, json={
        "date": start.isoformat(), "start_date": start.isoformat(), "amount": "1000.00",
        "description": "Aluguel", "source": "Imobiliária", "type": "FIXED", "payment_method": "CONTA",
    })
    client.post("/expenses", headers=headers, json={
        "date": date(*_month(0), 3).isoformat(), "amount": "450.00", "description": "Mercado",
        "source": "Supermercado", "type": "EXCEPTIONAL", "payment_method": "CONTA",
    })
    return headers


def _new_conversation(client, headers):
    return client.post("/assistant/conversations", headers=headers).json()["id"]


def _send(client, headers, conversation, text):
    return client.post(f"/assistant/conversations/{conversation}/messages", headers=headers, json={"content": text})


def _user_id(db_session, email="ana@example.com"):
    return db_session.query(User).filter(User.email == email).one().id


# ---- configuration -----------------------------------------------------------------------


def test_status_explains_missing_configuration(client, user_with_data, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "assistant_provider", "groq")
    monkeypatch.setattr(settings, "assistant_api_key", "")

    status = client.get("/assistant/status", headers=user_with_data).json()

    assert status["enabled"] is False
    assert status["source"] == "none"
    assert "Perfil" in status["reason"]
    assert status["history_days"] == 7


def test_local_ollama_needs_no_key(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "assistant_provider", "ollama")
    monkeypatch.setattr(settings, "assistant_api_key", "")
    config, reason = providers.system_config(settings)
    assert reason is None and config.base_url == "http://ollama:11434/v1"


def test_message_without_configured_model_is_503(client, user_with_data):
    fastapi_app.dependency_overrides[get_llm_client] = lambda: None
    try:
        response = _send(client, user_with_data, _new_conversation(client, user_with_data), "oi")
    finally:
        fastapi_app.dependency_overrides.pop(get_llm_client, None)
    assert response.status_code == 503


# ---- the tool loop ----------------------------------------------------------------------


def test_answer_built_from_a_tool_is_stored_with_its_source(client, user_with_data, fake_llm):
    llm = fake_llm(call("get_month_overview", month=_ym(0)), answer("Neste mês você gastou R$ 1.450,00."))

    turn = _send(client, user_with_data, _new_conversation(client, user_with_data), "Quanto gastei este mês?").json()

    message = turn["message"]
    assert message["content"] == "Neste mês você gastou R$ 1.450,00."
    assert message["sources"][0]["tool"] == "get_month_overview"
    assert message["flags"] == {"caution": False, "unverified_amounts": []}
    assert turn["conversation"]["title"] == "Quanto gastei este mês?"
    # The tool result really was sent back to the model.
    tool_message = next(m for m in llm.calls[1] if m["role"] == "tool")
    assert '"expenses_total": "1450.00"' in tool_message["content"]
    # The system prompt carries today's date and the user's first name.
    assert date.today().strftime("%d/%m/%Y") in llm.calls[0][0]["content"]
    assert "Ana" in llm.calls[0][0]["content"]


def test_previous_turns_are_sent_as_context(client, user_with_data, fake_llm):
    llm = fake_llm(answer("Olá, Ana!"), answer("Claro."))
    conversation = _new_conversation(client, user_with_data)
    _send(client, user_with_data, conversation, "Oi")
    _send(client, user_with_data, conversation, "Pode me ajudar?")

    roles = [(m["role"], m["content"]) for m in llm.calls[1][1:]]
    assert roles == [("user", "Oi"), ("assistant", "Olá, Ana!"), ("user", "Pode me ajudar?")]


def test_amount_not_found_in_the_data_is_flagged(client, user_with_data, fake_llm):
    fake_llm(call("get_month_overview", month=_ym(0)), answer("Você gastou R$ 1.450,00, uns R$ 999,99 a mais que o normal."))

    message = _send(client, user_with_data, _new_conversation(client, user_with_data), "Quanto gastei?").json()["message"]

    assert message["flags"]["unverified_amounts"] == ["R$ 999,99"]


def test_simulation_answers_always_carry_the_caution_flag(client, user_with_data, fake_llm):
    fake_llm(call("simulate_purchase", amount=1200, installments=3), answer("Pela projeção, seu saldo continuaria positivo."))

    message = _send(client, user_with_data, _new_conversation(client, user_with_data), "Posso parcelar 1200 em 3x?").json()["message"]

    assert message["flags"]["caution"] is True


def test_bad_tool_arguments_go_back_to_the_model_as_an_error(client, user_with_data, fake_llm):
    llm = fake_llm(call("get_month_overview", month="setembro"), call("get_month_overview", month=_ym(0)), answer("Pronto."))

    message = _send(client, user_with_data, _new_conversation(client, user_with_data), "Resumo do mês").json()["message"]

    first_tool_reply = next(m for m in llm.calls[1] if m["role"] == "tool")
    assert "AAAA-MM" in first_tool_reply["content"]
    assert [s["tool"] for s in message["sources"]] == ["get_month_overview"]


def test_provider_failure_stores_nothing(client, user_with_data, fake_llm):
    fake_llm(LLMError("O limite gratuito do provedor do assistente foi atingido por agora."))
    conversation = _new_conversation(client, user_with_data)

    response = _send(client, user_with_data, conversation, "Oi")
    detail = client.get(f"/assistant/conversations/{conversation}", headers=user_with_data).json()

    assert response.status_code == 503
    assert "limite gratuito" in response.json()["error"]["message"]
    assert detail["messages"] == []


def test_endless_tool_calls_stop_with_a_safe_answer(client, user_with_data, fake_llm):
    fake_llm(*[call("get_vault_summary") for _ in range(5)])

    message = _send(client, user_with_data, _new_conversation(client, user_with_data), "Cofre?").json()["message"]

    assert message["content"].startswith("Não consegui montar uma resposta confiável")


def test_hourly_limit(client, user_with_data, fake_llm, monkeypatch):
    monkeypatch.setattr(get_settings(), "assistant_max_messages_per_hour", 1)
    fake_llm(answer("Olá!"), answer("De novo!"))
    conversation = _new_conversation(client, user_with_data)

    assert _send(client, user_with_data, conversation, "Oi").status_code == 200
    assert _send(client, user_with_data, conversation, "Oi de novo").status_code == 429


# ---- history ---------------------------------------------------------------------------


def test_messages_older_than_seven_days_are_purged(client, user_with_data, db_session):
    conversation_id = _new_conversation(client, user_with_data)
    old = date.today() - timedelta(days=8)
    db_session.add_all([
        ChatMessage(conversation_id=conversation_id, role=ChatRole.USER, content="antiga", created_at=old),
        ChatMessage(conversation_id=conversation_id, role=ChatRole.ASSISTANT, content="resposta antiga", created_at=old),
    ])
    db_session.get(ChatConversation, conversation_id).created_at = old
    db_session.commit()

    conversations = client.get("/assistant/conversations", headers=user_with_data).json()

    assert conversations == []
    assert db_session.query(ChatMessage).filter(ChatMessage.conversation_id == conversation_id).count() == 0


def test_recent_messages_survive_the_purge(client, user_with_data, fake_llm):
    fake_llm(answer("Olá!"))
    conversation = _new_conversation(client, user_with_data)
    _send(client, user_with_data, conversation, "Oi")

    detail = client.get(f"/assistant/conversations/{conversation}", headers=user_with_data).json()

    assert [m["content"] for m in detail["messages"]] == ["Oi", "Olá!"]


def test_conversations_are_private(client, user_with_data, make_user):
    conversation = _new_conversation(client, user_with_data)
    make_user(email="beto@example.com", password="Sfort3!123")
    other = _auth_header(client, "beto@example.com")

    assert client.get(f"/assistant/conversations/{conversation}", headers=other).status_code == 404
    assert client.get("/assistant/conversations", headers=other).json() == []
    assert client.delete(f"/assistant/conversations/{conversation}", headers=other).status_code == 404


def test_delete_conversation(client, user_with_data):
    conversation = _new_conversation(client, user_with_data)
    assert client.delete(f"/assistant/conversations/{conversation}", headers=user_with_data).status_code == 204
    assert client.get("/assistant/conversations", headers=user_with_data).json() == []


# ---- tools: exact numbers -------------------------------------------------------------------


def test_month_overview_matches_the_dashboard(client, user_with_data, db_session):
    y, m = _month(0)
    result = tools.month_overview(db_session, _user_id(db_session), {"month": _ym(0)})
    dashboard = client.get(f"/dashboard/month/{y}/{m}", headers=user_with_data).json()

    assert result["entries_total"] == dashboard["entries_total"] == "3000.00"
    assert result["expenses_total"] == dashboard["expenses_total"] == "1450.00"
    assert result["accumulated_balance_end_of_month"] == "5550.00"  # 2000 + 2000 + 1550
    assert result["top_expense_sources"][0]["source"] == "Imobiliária"


def test_list_records_for_a_single_day(user_with_data, db_session):
    day = date(*_month(0), 3).isoformat()
    result = tools.list_records(db_session, _user_id(db_session), {"kind": "expense", "start_date": day, "end_date": day})

    assert result["matching_records"] == 1
    assert result["records"][0]["description"] == "Mercado"
    assert [r["description"] for r in result["fixed_monthly_rules_active_in_period"]] == ["Aluguel"]


def test_rank_by_source_over_a_period(user_with_data, db_session):
    result = tools.rank_by_source(
        db_session, _user_id(db_session), {"kind": "expense", "start_month": _ym(-2), "end_month": _ym(0)}
    )
    assert result["total"] == "3450.00"
    assert result["ranking"][0] == {"name": "Imobiliária", "total": "3000.00", "share_percent": 87.0}


def test_simulate_purchase_without_interest(user_with_data, db_session):
    result = tools.simulate_purchase(db_session, _user_id(db_session), {"amount": 1200, "installments": 3})

    assert result["installment_value"] == "400.00"
    assert result["total_interest"] == "0.00"
    current = next(m for m in result["months"] if m["month"] == tools._month_label(*_month(0)))
    assert current["accumulated_balance_without_purchase"] == "5550.00"
    assert current["accumulated_balance_with_purchase"] == "5150.00"
    assert result["stays_positive_in_projection"] is True


def test_simulate_purchase_with_interest_uses_price_table(user_with_data, db_session):
    result = tools.simulate_purchase(
        db_session, _user_id(db_session), {"amount": 1000, "installments": 12, "monthly_interest_percent": 2}
    )
    # Price: PMT = 1000 * 0.02 * 1.02^12 / (1.02^12 - 1) = 94.5596 -> total 1134.72
    assert result["total_paid"] == "1134.72"
    assert result["total_interest"] == "134.72"
    assert Decimal(result["installment_value"]) * 11 + Decimal(result["last_installment_value"]) == Decimal("1134.72")


def test_simulate_purchase_flags_negative_months(user_with_data, db_session):
    result = tools.simulate_purchase(db_session, _user_id(db_session), {"amount": 20000})
    assert result["stays_positive_in_projection"] is False
    assert result["months_with_negative_balance"]


def test_tools_only_see_the_callers_data(user_with_data, make_user, db_session):
    stranger = make_user(email="caio@example.com")
    result = tools.month_overview(db_session, stranger.id, {"month": _ym(0)})
    assert result["expenses_total"] == "0.00"


# ---- grounding and help search ------------------------------------------------------------


def test_grounding_parses_brazilian_and_plain_formats():
    results = [{"total": "1234.56", "other": "50.00"}]
    assert grounding.unverified_amounts("R$ 1.234,56 e R$ 50", results, "") == []
    assert grounding.unverified_amounts("R$ 1.234,57", results, "") == ["R$ 1.234,57"]
    assert grounding.unverified_amounts("uma compra de R$ 2.000,00", [], "posso gastar 2000 reais?") == []


def test_help_search_finds_the_right_section():
    # Ambiguous on purpose: both the app's how-to and the finance concept are relevant.
    titles = [s["title"] for s in knowledge.search("como funciona o parcelamento no cartão")]
    assert "Compras parceladas no crédito" in titles and "Parcelamento com e sem juros" in titles
    assert knowledge.search("o que é o cofre")[0]["title"] == "Cofre"


# ---- per-user settings (Perfil -> Assistente) -------------------------------------------


GROQ = {"provider": "groq", "api_key": "gsk_minha_chave_secreta_1234"}


def test_users_own_key_is_stored_encrypted_and_never_returned(client, user_with_data, db_session, monkeypatch):
    monkeypatch.setattr(get_settings(), "assistant_api_key", "")

    saved = client.put("/assistant/settings", headers=user_with_data, json=GROQ).json()

    assert saved["provider"] == "groq"
    assert saved["has_api_key"] is True
    assert saved["api_key_hint"] == "\u20261234"
    assert "gsk_minha_chave_secreta_1234" not in str(saved)
    row = db_session.get(AssistantSettings, _user_id(db_session))
    assert row.api_key_encrypted and "gsk_" not in row.api_key_encrypted
    assert secrets.decrypt(row.api_key_encrypted) == GROQ["api_key"]

    status = client.get("/assistant/status", headers=user_with_data).json()
    assert status["enabled"] is True
    assert status["source"] == "user"
    assert status["model"] == "openai/gpt-oss-120b"
    assert status["remaining_this_hour"] is None  # own quota - no shared hourly limit


def test_groq_requires_a_key(client, user_with_data):
    response = client.put("/assistant/settings", headers=user_with_data, json={"provider": "groq"})
    assert response.status_code == 422


def test_saving_without_key_keeps_the_saved_one_and_switching_provider_drops_it(client, user_with_data):
    client.put("/assistant/settings", headers=user_with_data, json=GROQ)

    kept = client.put(
        "/assistant/settings", headers=user_with_data, json={"provider": "groq", "model": "openai/gpt-oss-20b"}
    ).json()
    assert kept["has_api_key"] is True and kept["model"] == "openai/gpt-oss-20b"

    switched = client.put("/assistant/settings", headers=user_with_data, json={"provider": "ollama"}).json()
    assert switched["provider"] == "ollama" and switched["has_api_key"] is False


def test_back_to_system_default_deletes_the_saved_key(client, user_with_data, db_session):
    client.put("/assistant/settings", headers=user_with_data, json=GROQ)

    view = client.put("/assistant/settings", headers=user_with_data, json={"provider": "system"}).json()

    assert view["provider"] == "system" and view["has_api_key"] is False
    assert db_session.get(AssistantSettings, _user_id(db_session)) is None


@pytest.mark.parametrize(
    "url",
    [
        "http://api.example.com/v1",
        "https://127.0.0.1/v1",
        "https://localhost/v1",
        "https://10.0.0.5/v1",
        "https://169.254.169.254/v1",
    ],
)
def test_custom_url_must_be_public_https(client, user_with_data, url):
    response = client.put(
        "/assistant/settings",
        headers=user_with_data,
        json={"provider": "openai_compatible", "model": "x", "base_url": url, "api_key": "k"},
    )
    assert response.status_code == 422


def test_users_on_their_own_key_have_no_hourly_limit(client, user_with_data, fake_llm, monkeypatch):
    monkeypatch.setattr(get_settings(), "assistant_max_messages_per_hour", 1)
    client.put("/assistant/settings", headers=user_with_data, json=GROQ)
    fake_llm(answer("Um"), answer("Dois"))
    conversation = _new_conversation(client, user_with_data)

    assert _send(client, user_with_data, conversation, "Oi").status_code == 200
    assert _send(client, user_with_data, conversation, "Oi de novo").status_code == 200


def test_unreadable_saved_key_explains_what_to_do(client, user_with_data, monkeypatch):
    client.put("/assistant/settings", headers=user_with_data, json=GROQ)
    monkeypatch.setattr(get_settings(), "assistant_encryption_key", "outra-chave-de-criptografia")

    status = client.get("/assistant/status", headers=user_with_data).json()

    assert status["enabled"] is False
    assert "Cadastre-a de novo" in status["reason"]


def test_connection_test_uses_the_unsaved_values(client, user_with_data, monkeypatch):
    seen = {}

    def fake_chat(self, messages, tools):
        seen.update(base_url=self.base_url, key=self.api_key, models=self.models, tools=tools)
        return LLMReply(content="ok", model=self.models[0])

    monkeypatch.setattr(OpenAICompatibleClient, "chat", fake_chat)

    result = client.post("/assistant/settings/test", headers=user_with_data, json=GROQ).json()

    assert result == {"ok": True, "message": "Conex\u00e3o funcionando.", "model": "openai/gpt-oss-120b"}
    assert seen["base_url"] == "https://api.groq.com/openai/v1"
    assert seen["key"] == GROQ["api_key"]
    assert seen["tools"] == []


def test_connection_test_reports_provider_errors(client, user_with_data, monkeypatch):
    def failing_chat(self, messages, tools):
        raise LLMError("A chave de API do assistente \u00e9 inv\u00e1lida ou n\u00e3o tem acesso a este modelo.")

    monkeypatch.setattr(OpenAICompatibleClient, "chat", failing_chat)

    result = client.post("/assistant/settings/test", headers=user_with_data, json=GROQ).json()

    assert result["ok"] is False and "inv\u00e1lida" in result["message"]


def test_settings_are_private(client, user_with_data, make_user):
    client.put("/assistant/settings", headers=user_with_data, json=GROQ)
    make_user(email="dora@example.com", password="Sfort3!123")
    other = _auth_header(client, "dora@example.com")

    assert client.get("/assistant/settings", headers=other).json()["provider"] == "system"


# ---- pipeline trace -----------------------------------------------------------------------


@pytest.fixture()
def trace_log(monkeypatch):
    """Captures the JSON lines the trace logger writes (ASSISTANT_TRACE_FORMAT=json)."""
    import io

    monkeypatch.setattr(get_settings(), "assistant_trace_format", "json")

    from app.assistant import trace as trace_module

    stream = io.StringIO()
    handler = trace_module.logger.handlers[0]
    previous = handler.setStream(stream)
    yield lambda: [json.loads(line) for line in stream.getvalue().splitlines() if line.strip()]
    handler.setStream(previous)


def test_answer_carries_the_full_step_by_step_trace(client, user_with_data, fake_llm):
    first = call("get_month_overview", month=_ym(0))
    first.usage = {"prompt_tokens": 1800, "completion_tokens": 40, "total_tokens": 1840}
    first.reasoning = "Preciso do resumo do mês atual."
    final = answer("Você gastou R$ 1.450,00 e eu chutei R$ 7,00.")
    final.usage = {"prompt_tokens": 2100, "completion_tokens": 60, "total_tokens": 2160}
    fake_llm(first, final)

    message = _send(client, user_with_data, _new_conversation(client, user_with_data), "Quanto gastei?").json()["message"]
    trace = message["trace"]

    assert len(trace["trace_id"]) == 12 and trace["status"] == "ok"
    assert [s["kind"] for s in trace["steps"]] == [
        "request", "context", "llm", "tool", "llm", "grounding", "caution", "answer",
    ]
    steps = {s["kind"]: s for s in trace["steps"]}
    assert steps["request"]["question"] == "Quanto gastei?"
    assert steps["context"]["history_messages"] == 0 and "simulate_purchase" in steps["context"]["tools_offered"]
    llm1 = trace["steps"][2]
    assert llm1["outcome"] == "tool_calls"
    assert llm1["requested_tools"] == [{"name": "get_month_overview", "arguments": {"month": _ym(0)}}]
    assert llm1["reasoning"] == "Preciso do resumo do mês atual."
    tool = steps["tool"]
    assert tool["ok"] is True and tool["arguments"] == {"month": _ym(0)}
    assert '"expenses_total": "1450.00"' in tool["result"]
    assert steps["grounding"]["amounts"] == [
        {"amount": "R$ 1.450,00", "verified": True},
        {"amount": "R$ 7,00", "verified": False},
    ]
    assert steps["caution"]["applied"] is False
    assert trace["totals"] == {
        "llm_calls": 2, "provider_attempts": 0, "tool_calls": 1, "prompt_tokens": 3900, "completion_tokens": 100,
    }
    # Every step is timestamped relative to the start, in order.
    assert [s["n"] for s in trace["steps"]] == list(range(1, 9))
    assert all(a["at_ms"] <= b["at_ms"] for a, b in zip(trace["steps"], trace["steps"][1:]))


def test_trace_is_also_returned_with_the_conversation(client, user_with_data, fake_llm):
    fake_llm(answer("Olá!"))
    conversation = _new_conversation(client, user_with_data)
    _send(client, user_with_data, conversation, "Oi")

    messages = client.get(f"/assistant/conversations/{conversation}", headers=user_with_data).json()["messages"]

    assert messages[0]["trace"] is None  # the question itself has no trace
    assert messages[1]["trace"]["steps"][-1]["kind"] == "answer"


def test_summary_logs_trace_the_pipeline_without_user_content(client, user_with_data, fake_llm, trace_log, monkeypatch):
    monkeypatch.setattr(get_settings(), "assistant_trace_log", "summary")
    fake_llm(call("get_month_overview", month=_ym(0)), answer("Você gastou R$ 1.450,00."))

    message = _send(client, user_with_data, _new_conversation(client, user_with_data), "Pergunta secreta?").json()["message"]

    lines = trace_log()
    trace_id = message["trace"]["trace_id"]
    assert all(line["trace_id"] == trace_id for line in lines)
    assert [line["step"]["kind"] for line in lines if line["event"] == "assistant.step"] == [
        "request", "context", "llm", "tool", "llm", "grounding", "caution", "answer",
    ]
    assert lines[-1]["event"] == "assistant.trace" and lines[-1]["status"] == "ok"
    raw = json.dumps(lines, ensure_ascii=False)
    assert "Pergunta secreta" not in raw and "1450.00" not in raw and "1.450,00" not in raw
    assert "get_month_overview" in raw  # the shape of the pipeline is there


def test_full_logs_include_user_content(client, user_with_data, fake_llm, trace_log, monkeypatch):
    monkeypatch.setattr(get_settings(), "assistant_trace_log", "full")
    fake_llm(answer("Olá!"))

    _send(client, user_with_data, _new_conversation(client, user_with_data), "Pergunta visível")

    assert "Pergunta visível" in json.dumps(trace_log(), ensure_ascii=False)


def test_logs_can_be_turned_off(client, user_with_data, fake_llm, trace_log, monkeypatch):
    monkeypatch.setattr(get_settings(), "assistant_trace_log", "off")
    fake_llm(answer("Olá!"))

    _send(client, user_with_data, _new_conversation(client, user_with_data), "Oi")

    assert trace_log() == []


def test_failed_turn_is_traced_in_the_logs_and_the_error_cites_the_trace(client, user_with_data, fake_llm, trace_log):
    fake_llm(LLMError("O limite gratuito do provedor do assistente foi atingido por agora."))

    response = _send(client, user_with_data, _new_conversation(client, user_with_data), "Oi")

    lines = trace_log()
    trace_id = lines[0]["trace_id"]
    assert response.status_code == 503
    assert f"(rastreio {trace_id})" in response.json()["error"]["message"]
    kinds = [line["step"]["kind"] for line in lines if line["event"] == "assistant.step"]
    assert kinds == ["request", "context", "llm", "error"]
    assert lines[-1]["status"] == "error"


def test_system_prompt_lists_the_real_screens_and_forbids_technical_names():
    from app.assistant.prompt import build_system_prompt

    prompt = build_system_prompt("Ana")
    for screen in ("Dashboard", "Entradas", "Saídas", "Cofre", "Planejamentos", "Perfil"):
        assert screen in prompt
    assert "não invente" in prompt
    assert "Nunca cite nomes de ferramentas" in prompt
