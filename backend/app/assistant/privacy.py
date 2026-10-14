"""Masks personal identifiers before anything is sent to the language model.

Everything the model sees leaves the server when the provider is external (Groq, any
OpenAI-compatible API): the question, the recent history and the tool results, which
carry free text the user typed (descriptions and sources of records). Free text is
where personal data hides: "Pix para João, CPF 123.456.789-09", a card number, an
e-mail. None of it is needed to answer a finance question, so it's replaced with a
placeholder before sending, in every message:

    CPF 123.456.789-09   ->  [CPF]          e-mail             ->  [e-mail]
    CNPJ                 ->  [CNPJ]         telephone          ->  [telefone]
    card number (Luhn)   ->  [cartão]       random Pix key     ->  [chave Pix]

Amounts, dates and ordinary words are never touched: patterns are anchored on
formats that money and dates don't have, and bare digit runs only count when their
check digits are valid (CPF, CNPJ, Luhn for cards).

What stays the user's own - the stored conversation, the "Raciocínio" trace, the
admin log - keeps the original text; only the copy sent to the provider is masked.
"""

import re
from collections import Counter

PLACEHOLDERS = {
    "email": "[e-mail]",
    "cpf": "[CPF]",
    "cnpj": "[CNPJ]",
    "card": "[cartão]",
    "phone": "[telefone]",
    "pix": "[chave Pix]",
}

EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
PIX_RANDOM_KEY = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
CNPJ_FORMATTED = re.compile(r"\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b")
CPF_FORMATTED = re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b")
# 13-19 digits, optionally grouped by spaces or hyphens (how cards are written).
CARD = re.compile(r"\b\d(?:[ -]?\d){12,18}\b")
PHONE = re.compile(
    r"(?:\+55[\s-]?)?\(\d{2}\)\s?9?\d{4}[\s-]?\d{4}\b"  # (11) 91234-5678
    r"|\+55[\s-]?\d{2}[\s-]?9?\d{4}[\s-]?\d{4}\b"  # +55 11 91234 5678
    r"|\b\d{2}[\s-]9?\d{4}-\d{4}\b"  # 11 91234-5678
)
BARE_DIGITS = re.compile(r"\b\d{11}\b|\b\d{14}\b")


def _check_digit(digits: str, weights: range | list[int]) -> int:
    total = sum(int(d) * w for d, w in zip(digits, weights))
    rest = total % 11
    return 0 if rest < 2 else 11 - rest


def valid_cpf(value: str) -> bool:
    d = re.sub(r"\D", "", value)
    if len(d) != 11 or d == d[0] * 11:
        return False
    return int(d[9]) == _check_digit(d[:9], range(10, 1, -1)) and int(d[10]) == _check_digit(d[:10], range(11, 1, -1))


def valid_cnpj(value: str) -> bool:
    d = re.sub(r"\D", "", value)
    if len(d) != 14 or d == d[0] * 14:
        return False
    first = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    return int(d[12]) == _check_digit(d[:12], first) and int(d[13]) == _check_digit(d[:13], [6, *first])


def luhn(value: str) -> bool:
    digits = [int(c) for c in re.sub(r"\D", "", value)]
    if not 13 <= len(digits) <= 19:
        return False
    total = 0
    for i, digit in enumerate(reversed(digits)):
        if i % 2:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return total % 10 == 0


def redact(text: str) -> tuple[str, Counter]:
    """Returns the text with personal identifiers masked, and how many of each kind."""
    found: Counter = Counter()
    if not text:
        return text, found

    def sub(pattern: re.Pattern, kind: str, text: str, check=None) -> str:
        def replace(match: re.Match) -> str:
            if check is not None and not check(match.group(0)):
                return match.group(0)
            found[kind] += 1
            return PLACEHOLDERS[kind]

        return pattern.sub(replace, text)

    # Order matters: the most specific formats first, so a CNPJ isn't read as a phone.
    text = sub(EMAIL, "email", text)
    text = sub(PIX_RANDOM_KEY, "pix", text)
    text = sub(CNPJ_FORMATTED, "cnpj", text)
    text = sub(CPF_FORMATTED, "cpf", text)
    text = sub(CARD, "card", text, luhn)
    text = sub(PHONE, "phone", text)

    def bare(match: re.Match) -> str:
        value = match.group(0)
        if len(value) == 11 and valid_cpf(value):
            found["cpf"] += 1
            return PLACEHOLDERS["cpf"]
        if len(value) == 14 and valid_cnpj(value):
            found["cnpj"] += 1
            return PLACEHOLDERS["cnpj"]
        return value

    return BARE_DIGITS.sub(bare, text), found


def summary(found: Counter) -> dict[str, int] | None:
    """For the trace: {"cpf": 1, "email": 2}, or None when nothing was masked."""
    return dict(sorted(found.items())) or None
