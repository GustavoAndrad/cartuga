"""Checks that every R$ amount in an answer is backed by data.

The model is instructed to only state amounts that came from a tool, but instructions
aren't guarantees. This is the deterministic second line: any "R$ ..." in the answer
that doesn't match (to the cent) a number from this turn's tool results or from the
user's own question is reported, and the UI shows it as "not verified" - an
illustrative example in a general-finance explanation is flagged too, which is
accurate (it isn't the user's data).
"""

import json
import re
from decimal import Decimal, InvalidOperation

AMOUNT_IN_TEXT = re.compile(r"R\$\s?(-?\d[\d.,]*)")
NUMBER_IN_DATA = re.compile(r"-?\d+(?:[.,]\d+)*")


def _to_cents(raw: str) -> int | None:
    """Parses '1.234,56', '1234,56', '1.234', '1234.56' or '1234' into cents."""
    text = raw.strip().rstrip(".,")
    if not text:
        return None
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    elif text.count(".") == 1 and len(text.split(".")[1]) in (1, 2):
        pass  # decimal point (e.g. a tool value echoed as-is)
    else:
        text = text.replace(".", "")
    try:
        return int((Decimal(text) * 100).to_integral_value())
    except InvalidOperation:
        return None


def known_amounts(texts: list[str]) -> set[int]:
    known: set[int] = set()
    for text in texts:
        for match in NUMBER_IN_DATA.findall(text):
            cents = _to_cents(match)
            if cents is not None:
                known.add(abs(cents))
    return known


def check_amounts(answer: str, tool_results: list[dict], user_text: str) -> list[dict]:
    """Every R$ amount in the answer, each with whether it was found in the data -
    the full picture for the pipeline trace."""
    known = known_amounts([json.dumps(r, ensure_ascii=False) for r in tool_results] + [user_text])
    checked: list[dict] = []
    for match in AMOUNT_IN_TEXT.finditer(answer):
        cents = _to_cents(match.group(1))
        if cents is None:
            continue
        label = f"R$ {match.group(1).rstrip('.,')}"
        if all(c["amount"] != label for c in checked):
            checked.append({"amount": label, "verified": abs(cents) in known})
    return checked


def unverified_amounts(answer: str, tool_results: list[dict], user_text: str) -> list[str]:
    return [c["amount"] for c in check_amounts(answer, tool_results, user_text) if not c["verified"]]
