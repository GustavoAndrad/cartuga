"""The Assistente's tools: deterministic, read-only lookups over the user's own data.

This is where every number the assistant says comes from - the model only decides
which tool to call and how to phrase the answer, it never does the math itself. All
month-based numbers go through finance_engine, the same code the dashboard uses, so
the assistant can't disagree with the screens.

Every tool is scoped to `user_id`, never writes anything, and returns plain JSON
(amounts as BRL decimal strings).
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Callable

from sqlalchemy.orm import Session, joinedload

from app.assistant import knowledge
from app.models.entry import Entry
from app.models.enums import PaymentMethod, RecurrenceType
from app.models.expense import Expense
from app.services import dashboard_service, exchange_rate_service, planning_service, vault_service
from app.services import finance_engine as fe
from app.services.installment_service import build_installment_plan

CENTS = Decimal("0.01")
MAX_PERIOD_MONTHS = 36
MAX_LIST_LIMIT = 20
MONTH_NAMES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


class ToolError(Exception):
    """Bad arguments - the message goes back to the model so it can fix the call."""


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict
    run: Callable[[Session, int, dict], dict]
    label: Callable[[dict], str]
    # Decision-support output (affordability simulations): the answer gets the fixed
    # caution notice, regardless of what the model wrote.
    caution: bool = False

    def schema(self) -> dict:
        return {"type": "function", "function": {"name": self.name, "description": self.description, "parameters": self.parameters}}


# ---- argument helpers -------------------------------------------------------------------


def _money(value: Decimal | float | int) -> str:
    return str(Decimal(value).quantize(CENTS, rounding=ROUND_HALF_UP))


def _parse_month(value: Any, field: str) -> tuple[int, int]:
    try:
        year, month = (int(p) for p in str(value).split("-")[:2])
        if not 1 <= month <= 12 or not 1900 <= year <= 3000:
            raise ValueError
        return year, month
    except (ValueError, TypeError):
        raise ToolError(f"'{field}' deve estar no formato AAAA-MM (ex.: 2026-03).")


def _parse_date(value: Any, field: str) -> date:
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise ToolError(f"'{field}' deve estar no formato AAAA-MM-DD.")


def _month_label(year: int, month: int) -> str:
    return f"{MONTH_NAMES[month - 1]}/{year}"


def _month_range(args: dict) -> tuple[tuple[int, int], tuple[int, int]]:
    start = _parse_month(args.get("start_month"), "start_month")
    end = _parse_month(args.get("end_month", args.get("start_month")), "end_month")
    if fe.month_index(*start) > fe.month_index(*end):
        raise ToolError("start_month precisa ser antes de end_month.")
    if fe.month_index(*end) - fe.month_index(*start) + 1 > MAX_PERIOD_MONTHS:
        raise ToolError(f"O período pode ter no máximo {MAX_PERIOD_MONTHS} meses.")
    today = date.today()
    horizon = fe.shift_month(today.year, today.month, fe.MAX_HORIZON_MONTHS)
    if fe.month_index(*end) > fe.month_index(*horizon):
        raise ToolError(f"Só é possível consultar até {fe.MAX_HORIZON_MONTHS} meses à frente.")
    return start, end


def _limit(args: dict, default: int = 10) -> int:
    try:
        return max(1, min(MAX_LIST_LIMIT, int(args.get("limit", default))))
    except (ValueError, TypeError):
        return default


def _is_projected(year: int, month: int) -> bool:
    today = date.today()
    return fe.month_index(year, month) > fe.month_index(today.year, today.month)


def _by_source_totals(items: list[tuple[str, Decimal]], limit: int) -> list[dict]:
    totals: dict[str, Decimal] = defaultdict(Decimal)
    for source, amount in items:
        totals[source] += amount
    grand = sum(totals.values(), Decimal("0"))
    ranked = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [
        {"source": s, "total": _money(t), "share_percent": float((t / grand * 100).quantize(Decimal("0.1"))) if grand else 0.0}
        for s, t in ranked
    ]


def _fixed_active(rule_start: date, rule_end: date | None, start: date, end: date) -> bool:
    """Month-level overlap, the same way finance_engine applies FIXED rules."""
    first = fe.month_index(rule_start.year, rule_start.month)
    last = fe.month_index(rule_end.year, rule_end.month) if rule_end else None
    return first <= fe.month_index(end.year, end.month) and (last is None or last >= fe.month_index(start.year, start.month))


def _expense_items(summary: fe.MonthSummary) -> list[tuple[str, Decimal]]:
    return [(x.source, x.amount) for x in summary.direct_expenses] + [
        (i.expense.source, i.final_amount) for i in summary.installments
    ]


# ---- tools ----------------------------------------------------------------------------


def month_overview(db: Session, user_id: int, args: dict) -> dict:
    year, month = _parse_month(args.get("month"), "month")
    summary = fe.get_month_summary(db, user_id, year, month)
    point = fe.get_balance_series(db, user_id, year, month, year, month)[0]
    return {
        "month": _month_label(year, month),
        "is_projected": _is_projected(year, month),
        "entries_total": _money(summary.entries_total),
        "expenses_total": _money(summary.expenses_total),
        "of_which_card_installments": _money(summary.installments_total),
        "month_balance": _money(summary.balance),
        "accumulated_balance_end_of_month": _money(point.cumulative_balance),
        "top_expense_sources": _by_source_totals(_expense_items(summary), 5),
        "top_income_sources": _by_source_totals([(e.source, e.amount) for e in summary.entries], 5),
        "records_counted": len(summary.entries) + len(summary.direct_expenses) + len(summary.installments),
    }


def period_summary(db: Session, user_id: int, args: dict) -> dict:
    (sy, sm), (ey, em) = _month_range(args)
    series = fe.get_balance_series(db, user_id, sy, sm, ey, em)
    entries = sum((p.entries_total for p in series), Decimal("0"))
    expenses = sum((p.expenses_total for p in series), Decimal("0"))
    return {
        "period": f"{_month_label(sy, sm)} a {_month_label(ey, em)}",
        "months": [
            {
                "month": _month_label(p.year, p.month),
                "entries": _money(p.entries_total),
                "expenses": _money(p.expenses_total),
                "month_balance": _money(p.balance),
                "accumulated_balance": _money(p.cumulative_balance),
                "is_projected": p.is_projected,
            }
            for p in series
        ],
        "entries_total": _money(entries),
        "expenses_total": _money(expenses),
        "balance_total": _money(entries - expenses),
        "average_monthly_expenses": _money(expenses / len(series)) if series else "0.00",
        "accumulated_balance_at_end": _money(series[-1].cumulative_balance) if series else "0.00",
    }


def list_records(db: Session, user_id: int, args: dict) -> dict:
    kind = args.get("kind", "expense")
    if kind not in ("expense", "entry"):
        raise ToolError("kind deve ser 'expense' ou 'entry'.")
    start = _parse_date(args.get("start_date"), "start_date")
    end = _parse_date(args.get("end_date", args.get("start_date")), "end_date")
    if start > end:
        raise ToolError("start_date precisa ser antes de end_date.")
    order = args.get("order", "amount")
    limit = _limit(args)
    text = str(args.get("search") or "").strip().lower()

    rows: list[dict] = []
    fixed_rules: list[dict] = []
    if kind == "entry":
        records = db.query(Entry).filter(Entry.user_id == user_id).all()
        for e in records:
            if e.type == RecurrenceType.FIXED:
                if _fixed_active(e.start_date, e.end_date, start, end):
                    fixed_rules.append({"description": e.description, "source": e.source, "monthly_amount": _money(e.amount)})
                continue
            if start <= e.date <= end:
                rows.append({
                    "date": e.date.isoformat(), "description": e.description, "source": e.source,
                    "amount": _money(e.amount), "currency_entered": e.currency.value,
                    "planned": e.is_planned, "counts_in_balance": e.counts_toward_dashboard,
                })
    else:
        records = db.query(Expense).options(joinedload(Expense.installments)).filter(Expense.user_id == user_id).all()
        for x in records:
            if x.type == RecurrenceType.FIXED:
                if _fixed_active(x.start_date, x.end_date, start, end):
                    fixed_rules.append({"description": x.description, "source": x.source, "monthly_amount": _money(x.amount)})
                continue
            if start <= x.date <= end:
                row = {
                    "date": x.date.isoformat(), "description": x.description, "source": x.source,
                    "amount": _money(x.amount), "currency_entered": x.currency.value,
                    "payment": "credito" if x.payment_method == PaymentMethod.CREDITO else "conta",
                    "planned": x.is_planned,
                }
                if x.payment_method == PaymentMethod.CREDITO:
                    row["installments"] = len(x.installments)
                rows.append(row)

    if text:
        rows = [r for r in rows if text in r["description"].lower() or text in r["source"].lower()]
        fixed_rules = [r for r in fixed_rules if text in r["description"].lower() or text in r["source"].lower()]
    key = (lambda r: Decimal(r["amount"])) if order == "amount" else (lambda r: r["date"])
    rows.sort(key=key, reverse=True)
    return {
        "period": f"{start.isoformat()} a {end.isoformat()}",
        "matching_records": len(rows),
        "total_of_matching_records": _money(sum((Decimal(r["amount"]) for r in rows), Decimal("0"))),
        "records": rows[:limit],
        "fixed_monthly_rules_active_in_period": fixed_rules[:10],
        "note": "Registros fixos valem para o mês inteiro, sem dia específico; compras no crédito aparecem pelo valor total na data da compra.",
    }


def rank_by_source(db: Session, user_id: int, args: dict) -> dict:
    kind = args.get("kind", "expense")
    if kind not in ("expense", "entry"):
        raise ToolError("kind deve ser 'expense' ou 'entry'.")
    (sy, sm), (ey, em) = _month_range(args)
    group = args.get("group_by", "source")
    items: list[tuple[str, Decimal]] = []
    for year, month in fe.iterate_months(sy, sm, ey, em):
        summary = fe.get_month_summary(db, user_id, year, month)
        if kind == "entry":
            items += [((e.source if group == "source" else e.description), e.amount) for e in summary.entries]
        elif group == "source":
            items += _expense_items(summary)
        else:
            items += [(x.description, x.amount) for x in summary.direct_expenses]
            items += [(i.expense.description, i.final_amount) for i in summary.installments]
    ranking = _by_source_totals(items, _limit(args))
    return {
        "period": f"{_month_label(sy, sm)} a {_month_label(ey, em)}",
        "kind": "saidas" if kind == "expense" else "entradas",
        "grouped_by": "fonte" if group == "source" else "descricao",
        "total": _money(sum((a for _, a in items), Decimal("0"))),
        "ranking": [{"name": r["source"], "total": r["total"], "share_percent": r["share_percent"]} for r in ranking],
    }


def _price_installment(principal: Decimal, monthly_rate: Decimal, n: int) -> Decimal:
    """Fixed installment of the Price (French) amortization system."""
    if monthly_rate == 0:
        return principal / n
    factor = (1 + monthly_rate) ** n
    return principal * monthly_rate * factor / (factor - 1)


def simulate_purchase(db: Session, user_id: int, args: dict) -> dict:
    try:
        amount = Decimal(str(args.get("amount")))
        installments = int(args.get("installments", 1))
        rate_percent = Decimal(str(args.get("monthly_interest_percent", 0) or 0))
    except Exception:
        raise ToolError("amount, installments e monthly_interest_percent devem ser números.")
    if amount <= 0:
        raise ToolError("amount precisa ser maior que zero.")
    if not 1 <= installments <= 60:
        raise ToolError("installments deve estar entre 1 e 60.")
    if not 0 <= rate_percent <= 30:
        raise ToolError("monthly_interest_percent deve estar entre 0 e 30.")

    today = date.today()
    first = _parse_month(args["first_month"], "first_month") if args.get("first_month") else (today.year, today.month)
    # Same convention as a real CREDITO purchase: 1st installment in the purchase month.
    rate = rate_percent / 100
    total = (_price_installment(amount, rate, installments) * installments).quantize(CENTS, rounding=ROUND_HALF_UP)
    plan = build_installment_plan(date(first[0], first[1], 1), total, installments)

    # Show the whole payment period plus 2 months after, capped at the horizon.
    last = fe.shift_month(first[0], first[1], installments - 1 + 2)
    horizon = fe.shift_month(today.year, today.month, fe.MAX_HORIZON_MONTHS)
    if fe.month_index(*last) > fe.month_index(*horizon):
        last = horizon
    start_series = min((today.year, today.month), first, key=lambda ym: fe.month_index(*ym))
    series = fe.get_balance_series(db, user_id, start_series[0], start_series[1], last[0], last[1])

    paid_by_month: dict[int, Decimal] = {fe.month_index(p.due_date.year, p.due_date.month): p.base_amount for p in plan}
    cumulative_paid = Decimal("0")
    months = []
    for p in series:
        idx = fe.month_index(p.year, p.month)
        payment = paid_by_month.get(idx, Decimal("0"))
        cumulative_paid += payment
        months.append({
            "month": _month_label(p.year, p.month),
            "installment": _money(payment),
            "accumulated_balance_without_purchase": _money(p.cumulative_balance),
            "accumulated_balance_with_purchase": _money(p.cumulative_balance - cumulative_paid),
            "is_projected": p.is_projected,
        })

    with_purchase = [Decimal(m["accumulated_balance_with_purchase"]) for m in months]
    lowest = min(with_purchase) if with_purchase else Decimal("0")
    lowest_month = months[with_purchase.index(lowest)]["month"] if months else ""
    negative_months = [m["month"] for m, v in zip(months, with_purchase) if v < 0]
    return {
        "purchase_amount": _money(amount),
        "installments": installments,
        "monthly_interest_percent": float(rate_percent),
        "installment_value": _money(plan[0].base_amount),
        "last_installment_value": _money(plan[-1].base_amount),
        "total_paid": _money(total),
        "total_interest": _money(total - amount),
        "first_installment_month": _month_label(*first),
        "lowest_accumulated_balance_with_purchase": _money(lowest),
        "lowest_balance_month": lowest_month,
        "months_with_negative_balance": negative_months,
        "stays_positive_in_projection": not negative_months,
        "months": months[:30],
        "vault_balance_not_included": _money(vault_service.get_vault_balance(db, user_id)),
        "assumptions": (
            "Projeção a partir dos lançamentos já cadastrados (fixos, parcelas e planejados); "
            "gastos ainda não registrados não entram. O saldo do Cofre não está incluído."
        ),
    }


def current_snapshot(db: Session, user_id: int, args: dict) -> dict:
    data = dashboard_service.build_dashboard(db, user_id, 0, 6)
    cards = data["cards"]
    today = date.today()
    return {
        "today": today.isoformat(),
        "accumulated_balance_now": _money(cards.current_balance),
        "accumulated_balance_end_of_last_month": _money(cards.previous_month_balance),
        "income_this_month": _money(cards.current_month_income),
        "expenses_this_month": _money(cards.current_month_expenses),
        "projected_balance_in_6_months": _money(cards.projected_balance),
        "remaining_card_installments_total": _money(cards.committed_installments),
        "vault_balance": _money(cards.vault_balance),
    }


def vault_summary(db: Session, user_id: int, args: dict) -> dict:
    summary = vault_service.get_vault_summary(db, user_id)
    recent = sorted(vault_service.list_vault_transactions(db, user_id), key=lambda t: t.date, reverse=True)[:5]
    labels = {"DEPOSIT_FRESH": "guardar do zero", "DEPOSIT_CARVE": "recorte de entrada", "WITHDRAWAL": "retirada"}
    return {
        "balance": _money(summary.balance),
        "total_deposited": _money(summary.total_deposited),
        "total_withdrawn": _money(summary.total_withdrawn),
        "recent_movements": [
            {"date": t.date.isoformat(), "type": labels[t.type.value], "description": t.description, "amount": _money(t.amount)}
            for t in recent
        ],
    }


def exchange_rates(db: Session, user_id: int, args: dict) -> dict:
    rates = exchange_rate_service.get_live_rates()
    return {
        "source": "PTAX de venda do Banco Central do Brasil (ou cotação de reserva se a API estiver fora)",
        "usd_in_brl": _money(Decimal(1) / Decimal(str(rates["USD"]))) if rates.get("USD") else None,
        "eur_in_brl": _money(Decimal(1) / Decimal(str(rates["EUR"]))) if rates.get("EUR") else None,
    }


def pending_reviews(db: Session, user_id: int, args: dict) -> dict:
    review = planning_service.list_pending_review(db, user_id)
    items = [
        {"kind": "entrada", "description": i.entry.description, "date": i.review_date.isoformat(), "amount": _money(i.entry.amount)}
        for i in review.entries
    ] + [
        {"kind": "saida", "description": i.expense.description, "date": i.review_date.isoformat(), "amount": _money(i.expense.amount)}
        for i in review.expenses
    ]
    return {"pending_count": len(items), "items": items[:15]}


def search_help(db: Session, user_id: int, args: dict) -> dict:
    query = str(args.get("query") or "").strip()
    if not query:
        raise ToolError("Informe query.")
    return {"sections": knowledge.search(query)}


def _period_label(args: dict) -> str:
    try:
        (sy, sm), (ey, em) = _month_range(args)
    except ToolError:
        return "período"
    return _month_label(sy, sm) if (sy, sm) == (ey, em) else f"{_month_label(sy, sm)} a {_month_label(ey, em)}"


def _month_arg_label(args: dict) -> str:
    try:
        return _month_label(*_parse_month(args.get("month"), "month"))
    except ToolError:
        return "mês"


MONTH_PARAM = {"type": "string", "description": "Mês no formato AAAA-MM."}
KIND_PARAM = {"type": "string", "enum": ["expense", "entry"], "description": "expense = saídas, entry = entradas."}

TOOLS: list[Tool] = [
    Tool(
        "get_current_snapshot",
        "Situação atual: saldo acumulado agora, entradas e saídas do mês atual, saldo projetado em 6 meses, parcelas a pagar e saldo do Cofre.",
        {"type": "object", "properties": {}},
        current_snapshot,
        lambda a: "Situação atual (cards do dashboard)",
    ),
    Tool(
        "get_month_overview",
        "Totais de um mês (passado, atual ou futuro/projetado): entradas, saídas, saldo do mês, saldo acumulado no fim do mês e principais fontes.",
        {"type": "object", "properties": {"month": MONTH_PARAM}, "required": ["month"]},
        month_overview,
        lambda a: f"Resumo de {_month_arg_label(a)}",
    ),
    Tool(
        "get_period_summary",
        "Mês a mês de um período (até 36 meses): entradas, saídas, saldo e saldo acumulado, mais totais e média mensal de gastos.",
        {"type": "object", "properties": {"start_month": MONTH_PARAM, "end_month": MONTH_PARAM}, "required": ["start_month", "end_month"]},
        period_summary,
        lambda a: f"Período {_period_label(a)}",
    ),
    Tool(
        "list_records",
        "Lista lançamentos com data entre start_date e end_date (inclui um dia só): gastos/entradas pontuais e compras no crédito, ordenados por valor ou data. Use para 'quanto gastei no dia X', 'maior compra', buscar por texto.",
        {
            "type": "object",
            "properties": {
                "kind": KIND_PARAM,
                "start_date": {"type": "string", "description": "AAAA-MM-DD"},
                "end_date": {"type": "string", "description": "AAAA-MM-DD"},
                "order": {"type": "string", "enum": ["amount", "date"]},
                "limit": {"type": "integer", "minimum": 1, "maximum": MAX_LIST_LIMIT},
                "search": {"type": "string", "description": "Texto opcional na descrição ou fonte."},
            },
            "required": ["kind", "start_date", "end_date"],
        },
        list_records,
        lambda a: f"Lançamentos de {a.get('start_date', '?')} a {a.get('end_date', a.get('start_date', '?'))}",
    ),
    Tool(
        "rank_by_source",
        "Ranking do que mais pesou num período: com o que mais gastou (saídas) ou maiores fontes de renda (entradas), por fonte ou descrição. Inclui fixos e parcelas.",
        {
            "type": "object",
            "properties": {
                "kind": KIND_PARAM,
                "start_month": MONTH_PARAM,
                "end_month": MONTH_PARAM,
                "group_by": {"type": "string", "enum": ["source", "description"]},
                "limit": {"type": "integer", "minimum": 1, "maximum": MAX_LIST_LIMIT},
            },
            "required": ["kind", "start_month", "end_month"],
        },
        rank_by_source,
        lambda a: f"Ranking de {'entradas' if a.get('kind') == 'entry' else 'saídas'} ({_period_label(a)})",
    ),
    Tool(
        "simulate_purchase",
        "Simula uma compra à vista ou parcelada (com juros mensais opcionais) e mostra como fica o saldo acumulado projetado mês a mês. Use para 'tenho dinheiro para...', 'posso parcelar...'.",
        {
            "type": "object",
            "properties": {
                "amount": {"type": "number", "description": "Valor da compra em reais."},
                "installments": {"type": "integer", "minimum": 1, "maximum": 60},
                "monthly_interest_percent": {"type": "number", "description": "Juros ao mês em %, ex. 2.5. 0 se sem juros."},
                "first_month": MONTH_PARAM,
            },
            "required": ["amount"],
        },
        simulate_purchase,
        lambda a: f"Simulação de compra de R$ {a.get('amount', '?')} em {a.get('installments', 1)}x",
        caution=True,
    ),
    Tool("get_vault_summary", "Saldo do Cofre (reserva), total guardado/retirado e últimas movimentações.", {"type": "object", "properties": {}}, vault_summary, lambda a: "Cofre"),
    Tool("get_exchange_rates", "Cotação atual do dólar e do euro em reais (PTAX do Banco Central).", {"type": "object", "properties": {}}, exchange_rates, lambda a: "Cotação do dia"),
    Tool("get_pending_reviews", "Lançamentos planejados aguardando confirmação na tela Planejamentos.", {"type": "object", "properties": {}}, pending_reviews, lambda a: "Planejados pendentes"),
    Tool(
        "search_help",
        "Busca no manual do Cartuga: como funcionalidades funcionam, como os valores são calculados, onde encontrar cada coisa.",
        {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
        search_help,
        lambda a: "Manual do Cartuga",
    ),
]

TOOLS_BY_NAME = {t.name: t for t in TOOLS}


def schemas() -> list[dict]:
    return [t.schema() for t in TOOLS]
