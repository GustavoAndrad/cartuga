"""Personal identifiers never reach the language model; everything else does, intact."""

import json
from datetime import date

import pytest

from app.assistant import privacy
from tests.test_assistant import (  # noqa: F401 - fixtures
    _month,
    _new_conversation,
    _send,
    answer,
    call,
    fake_llm,
    user_with_data,
)

CPF = "529.982.247-25"  # valid check digits
CARD = "4111 1111 1111 1111"  # valid Luhn


# ---- the masking itself --------------------------------------------------------------------


@pytest.mark.parametrize(
    "text, kind, placeholder",
    [
        (f"CPF {CPF}", "cpf", "[CPF]"),
        ("cpf 52998224725", "cpf", "[CPF]"),
        ("CNPJ 11.222.333/0001-81", "cnpj", "[CNPJ]"),
        ("cnpj 11222333000181", "cnpj", "[CNPJ]"),
        (f"cartão {CARD}", "card", "[cartão]"),
        ("cartão 4111-1111-1111-1111", "card", "[cartão]"),
        ("ana.souza+fin@gmail.com", "email", "[e-mail]"),
        ("(11) 91234-5678", "phone", "[telefone]"),
        ("+55 11 91234 5678", "phone", "[telefone]"),
        ("21 3456-7890", "phone", "[telefone]"),
        ("chave 123e4567-e89b-12d3-a456-426614174000", "pix", "[chave Pix]"),
    ],
)
def test_personal_identifiers_are_masked(text, kind, placeholder):
    masked, found = privacy.redact(text)
    assert placeholder in masked and found[kind] == 1


@pytest.mark.parametrize(
    "text",
    [
        "Quanto gastei de R$ 1.234.567,89 em 10x de 2,5%?",
        "parcela 1/10 em 05/10/2026, período 2026-10-01 a 2026-10-31",
        json.dumps({"date": "2026-10-01", "amount": "1450.00", "total": "12345678.90", "share_percent": 87.0}),
        "pedido 12345678901 (não é um CPF válido)",
        "cartão 4111-1111-1111-1112 (Luhn inválido)",
        "Aluguel do apartamento 302, bloco B",
    ],
)
def test_money_dates_and_ordinary_numbers_are_untouched(text):
    assert privacy.redact(text) == (text, {})


def test_check_digit_validators():
    assert privacy.valid_cpf(CPF) and not privacy.valid_cpf("529.982.247-26") and not privacy.valid_cpf("111.111.111-11")
    assert privacy.valid_cnpj("11.222.333/0001-81") and not privacy.valid_cnpj("11.222.333/0001-82")
    assert privacy.luhn(CARD) and not privacy.luhn("4111 1111 1111 1112")


# ---- end to end: what the provider actually receives ------------------------------------------


def test_the_model_never_receives_personal_data(client, user_with_data, fake_llm):
    day = date(*_month(0), 3).isoformat()
    client.post("/expenses", headers=user_with_data, json={
        "date": day, "amount": "120.00", "description": f"Pix para João, CPF {CPF}",
        "source": "joao.silva@example.com", "type": "EXCEPTIONAL", "payment_method": "CONTA",
    })
    llm = fake_llm(
        call("list_records", kind="expense", start_date=day, end_date=day),
        answer("Você pagou R$ 120,00 a [CPF]."),
        answer("De nada!"),
    )
    conversation = _new_conversation(client, user_with_data)

    first = _send(client, user_with_data, conversation, f"Meu cartão {CARD} pagou o Pix? CPF {CPF}").json()["message"]
    _send(client, user_with_data, conversation, "Obrigada")  # the first question goes back as history

    sent = json.dumps(llm.calls, ensure_ascii=False)
    for secret in (CPF, CARD, "joao.silva@example.com", "ana@example.com"):
        assert secret not in sent, secret
    assert "[CPF]" in sent and "[cartão]" in sent and "[e-mail]" in sent
    assert "Pix para João" in sent and "120.00" in sent  # the useful part still goes

    # The user's own copy keeps the original; the trace says what was masked.
    detail = client.get(f"/assistant/conversations/{conversation}", headers=user_with_data).json()
    assert detail["messages"][0]["content"].endswith(f"CPF {CPF}")
    steps = {s["kind"]: s for s in first["trace"]["steps"]}
    assert steps["context"]["redacted"] == {"card": 1, "cpf": 1}
    assert steps["tool"]["redacted"] == {"cpf": 1, "email": 1}
    assert CPF not in steps["tool"]["result"]


def test_nothing_masked_means_no_privacy_note(client, user_with_data, fake_llm):
    fake_llm(answer("Olá!"))
    message = _send(client, user_with_data, _new_conversation(client, user_with_data), "Oi").json()["message"]
    context = next(s for s in message["trace"]["steps"] if s["kind"] == "context")
    assert context["redacted"] is None


def test_system_prompt_carries_only_the_first_name_and_the_privacy_rules():
    from app.assistant.prompt import build_system_prompt

    prompt = build_system_prompt("Ana Maria Souza")
    assert "Ana" in prompt and "Souza" not in prompt and "Maria" not in prompt
    assert "[CPF]" in prompt and "Nunca peça CPF" in prompt
