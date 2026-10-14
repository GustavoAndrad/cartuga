"""Demo data seeds: loads the mock records in app/seeds/mocks/ into the demo account
(INITIAL_ADMIN_EMAIL), or removes them.

Run inside the backend container, with the API up:

    docker compose exec backend python -m app.seeds            # apply the mocks
    docker compose exec backend python -m app.seeds --undo     # remove them
    docker compose exec backend python -m app.seeds --reset    # undo + apply

Mock dates are relative to the day the seed runs, so the demo always covers the last
12 months up to the current one (plus a few planned/projected records ahead):

    {"month": -12, "day": 5}       day 5 of the month 12 months before the current one
    {"month": 0, "day": "last"}    last day of the current month
    {"days": -2}                   two days before today

A record that already happened (anything not Planejado) is never placed after today:
if its resolved `date` falls later in the current month, it's moved to today.

Everything goes through the public HTTP API (not the ORM directly), so every business
rule - PTAX currency conversion, installment generation, Cofre balance limits, the
Planejado review workflow - is applied exactly as it would be from the UI.

--undo deletes ALL financial records (entries, expenses, installments, Cofre
movements, Planejado reviews) of the demo account - not only the ones the mocks
created. The account itself is kept.
"""

import argparse
import calendar
import json
import logging
import random
import sys
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

import httpx

from app.config import get_settings

logger = logging.getLogger("cartuga.seeds")

API_URL = "http://localhost:8000"
MOCKS_DIR = Path(__file__).parent / "mocks"
HISTORY_MONTHS = 12
DATE_FIELDS = ("date", "start_date", "end_date")

# Fixed seed: the generated day-to-day expenses are the same on every run (for the
# same current date), so the demo stays reproducible.
rng = random.Random(2026)


def load_mock(name: str) -> list[dict]:
    return json.loads((MOCKS_DIR / f"{name}.json").read_text(encoding="utf-8"))


def shift_month(offset: int) -> tuple[int, int]:
    today = date.today()
    year, month = divmod(today.year * 12 + today.month - 1 + offset, 12)
    return year, month + 1


def resolve_date(spec: dict) -> date:
    if "days" in spec:
        return date.today() + timedelta(days=spec["days"])
    year, month = shift_month(spec["month"])
    last_day = calendar.monthrange(year, month)[1]
    day = last_day if spec["day"] == "last" else min(spec["day"], last_day)
    return date(year, month, day)


def resolve(record: dict) -> dict:
    """Turns every relative date of a mock record into an ISO date for the API."""
    resolved = dict(record)
    for field in DATE_FIELDS:
        if isinstance(resolved.get(field), dict):
            resolved[field] = resolve_date(resolved[field])
    if resolved.get("type") == "FIXED":
        # The API requires `date` for every record; for a FIXED one it's just its start.
        resolved.setdefault("date", resolved["start_date"])
    if not resolved.get("is_planned") and isinstance(resolved.get("date"), date):
        resolved["date"] = min(resolved["date"], date.today())
    return {k: (v.isoformat() if isinstance(v, date) else v) for k, v in resolved.items()}


class Api:
    def __init__(self, client: httpx.Client):
        self.client = client

    def _check(self, response: httpx.Response):
        if response.status_code >= 400:
            raise RuntimeError(
                f"{response.request.method} {response.request.url} -> {response.status_code}: {response.text}"
            )
        return response.json() if response.content else None

    def get(self, path: str):
        return self._check(self.client.get(path))

    def post(self, path: str, payload: dict | None = None):
        return self._check(self.client.post(path, json=payload))

    def delete(self, path: str):
        return self._check(self.client.delete(path))


def _without(record: dict, *keys: str) -> dict:
    return {k: v for k, v in record.items() if k not in keys}


def apply_entries(api: Api, refs: dict[str, dict]) -> None:
    for record in load_mock("entries"):
        created = api.post("/entries", resolve({"type": "EXCEPTIONAL", **_without(record, "ref")}))
        if "ref" in record:
            refs[record["ref"]] = created


def apply_fixed_expenses(api: Api) -> None:
    for record in load_mock("fixed_expenses"):
        api.post("/expenses", resolve({"type": "FIXED", "payment_method": "CONTA", **record}))


def apply_one_off_expenses(api: Api) -> None:
    for record in load_mock("one_off_expenses"):
        api.post("/expenses", resolve({"type": "EXCEPTIONAL", "payment_method": "CONTA", **record}))


def apply_variable_expenses(api: Api) -> None:
    """Expands each spending pattern into `per_month` expenses for every month of the
    window - random day and amount within the pattern's range, never after today."""
    today = date.today()
    for offset in range(-HISTORY_MONTHS, 1):
        year, month = shift_month(offset)
        last_day = today.day if offset == 0 else calendar.monthrange(year, month)[1]
        for pattern in load_mock("variable_expenses"):
            low, high = Decimal(pattern["min"]), Decimal(pattern["max"])
            for _ in range(pattern["per_month"]):
                amount = low + (high - low) * Decimal(rng.random())
                api.post("/expenses", {
                    "type": "EXCEPTIONAL",
                    "payment_method": "CONTA",
                    "date": date(year, month, rng.randint(1, last_day)).isoformat(),
                    "amount": str(amount.quantize(Decimal("0.01"))),
                    "description": rng.choice(pattern["descriptions"]),
                    "source": pattern["source"],
                })


def apply_credit_purchases(api: Api) -> None:
    current_month = date.today().year * 12 + date.today().month
    for record in load_mock("credit_purchases"):
        payload = {"type": "EXCEPTIONAL", "payment_method": "CREDITO",
                   **_without(record, "adjustments", "advance_next_installments")}
        purchase = api.post("/expenses", resolve(payload))
        installments = {i["installment_number"]: i for i in purchase["installments"]}

        for adjustment in record.get("adjustments", []):
            installment = installments[adjustment["installment_number"]]
            api.post(f"/installments/{installment['id']}/adjustments", _without(adjustment, "installment_number"))

        # Advances must happen in order, starting from the first still-future one.
        future = [
            i for _, i in sorted(installments.items())
            if date.fromisoformat(i["due_date"]).year * 12 + date.fromisoformat(i["due_date"]).month > current_month
        ]
        for installment in future[: record.get("advance_next_installments", 0)]:
            api.post(f"/installments/{installment['id']}/advance")


def apply_planned(api: Api) -> None:
    for record in load_mock("planned"):
        path = "/entries" if record["kind"] == "entry" else "/expenses"
        created = api.post(path, resolve(_without(record, "kind", "reviews")))

        # Month-by-month review of a FIXED Planejado rule. Only allowed from the month
        # it was marked Planejado (i.e. today) onwards - see Entry.is_planned_since -
        # so review offsets are always >= 0.
        for review in record.get("reviews", []):
            year, month = shift_month(review["month"])
            if review["status"] == "CONFIRMED":
                body = {"amount": review["amount"]} if "amount" in review else {}
                api.post(f"{path}/{created['id']}/occurrences/{year}/{month}/confirm", body)
            else:
                api.post(f"{path}/{created['id']}/occurrences/{year}/{month}/reject")


def apply_vault(api: Api, refs: dict[str, dict]) -> None:
    for record in load_mock("vault"):
        payload = resolve(_without(record, "source_ref"))
        if "source_ref" in record:
            payload["source_entry_id"] = refs[record["source_ref"]]["id"]
        api.post("/vault/transactions", payload)


def apply(api: Api) -> None:
    if api.get("/entries") or api.get("/expenses"):
        logger.error("The demo account already has records - run with --undo or --reset first.")
        sys.exit(1)

    first_year, first_month = shift_month(-HISTORY_MONTHS)
    logger.info("Seeding the demo account from %02d/%d to today...", first_month, first_year)

    refs: dict[str, dict] = {}
    steps = [
        ("entries", lambda: apply_entries(api, refs)),
        ("fixed expenses", lambda: apply_fixed_expenses(api)),
        ("one-off expenses", lambda: apply_one_off_expenses(api)),
        ("day-to-day expenses", lambda: apply_variable_expenses(api)),
        ("credit card purchases", lambda: apply_credit_purchases(api)),
        ("planned records", lambda: apply_planned(api)),
        ("vault", lambda: apply_vault(api, refs)),
    ]
    for label, step in steps:
        logger.info("Seeding %s...", label)
        step()
    logger.info("Done: %d entries, %d expenses.", len(api.get("/entries")), len(api.get("/expenses")))


def undo(api: Api) -> None:
    # Cofre movements first: deleting one also deletes the entry/expense it generated.
    transactions = api.get("/vault/transactions")
    for transaction in transactions:
        api.delete(f"/vault/transactions/{transaction['id']}")
    # Installments, adjustments and Planejado reviews cascade from their parent record.
    expenses = api.get("/expenses")
    for expense in expenses:
        api.delete(f"/expenses/{expense['id']}")
    entries = api.get("/entries")
    for entry in entries:
        api.delete(f"/entries/{entry['id']}")
    logger.info(
        "Removed %d vault movements, %d expenses and %d entries.", len(transactions), len(expenses), len(entries)
    )


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.seeds", description="Demo data seeds.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--undo", action="store_true", help="remove every financial record of the demo account")
    mode.add_argument("--reset", action="store_true", help="--undo, then apply the mocks again")
    args = parser.parse_args()

    settings = get_settings()
    with httpx.Client(base_url=API_URL, timeout=60) as client:
        api = Api(client)
        login = api.post("/auth/login", {
            "email": settings.initial_admin_email, "password": settings.initial_admin_password,
        })
        client.headers["Authorization"] = f"Bearer {login['access_token']}"

        if args.undo or args.reset:
            undo(api)
        if not args.undo:
            apply(api)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    main()
