"""Per-user raw data export (CSV) - any role, only the caller's own records.

Unlike the admin xlsx export (export_service: the whole database, for backup/restore),
this one is meant to be opened in a spreadsheet: it covers a chosen month range that
may reach into the future, and every month-based dataset is built from the very same
finance_engine calculations the dashboard uses - so projected months, Planejado
reviews and advanced installments come out exactly as the app shows them.
"""

import csv
import io
import zipfile
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Callable

from sqlalchemy.orm import Session, joinedload

from app.models.entry import Entry
from app.models.entry_occurrence_review import EntryOccurrenceReview
from app.models.enums import PaymentMethod, RecurrenceType
from app.models.expense import Expense
from app.models.expense_occurrence_review import ExpenseOccurrenceReview
from app.models.installment import Installment
from app.models.vault_transaction import VaultTransaction
from app.services import finance_engine as fe
from app.utils.errors import ValidationAppError

MAX_SPAN_MONTHS = 121
PREVIEW_ROWS = 8

RECURRENCE_LABEL = {RecurrenceType.FIXED: "Fixa", RecurrenceType.EXCEPTIONAL: "Excepcional"}
PAYMENT_LABEL = {PaymentMethod.CONTA: "Conta", PaymentMethod.CREDITO: "Crédito"}
VAULT_LABEL = {
    "DEPOSIT_FRESH": "Guardar do zero",
    "DEPOSIT_CARVE": "Recorte de entrada",
    "WITHDRAWAL": "Retirada",
}
CARVE_LABEL = {"PERCENTAGE": "Percentual", "FIXED": "Valor fixo"}
REVIEW_LABEL = {"CONFIRMED": "Confirmada", "REJECTED": "Recusada"}


@dataclass
class ExportConfig:
    from_year: int
    from_month: int
    to_year: int
    to_month: int
    datasets: list[str]
    # "excel_br": ';' separator and ',' decimals (opens straight in a pt-BR Excel);
    # "standard": ',' separator and '.' decimals.
    format: str = "excel_br"

    @property
    def from_idx(self) -> int:
        return fe.month_index(self.from_year, self.from_month)

    @property
    def to_idx(self) -> int:
        return fe.month_index(self.to_year, self.to_month)


@dataclass
class Dataset:
    key: str
    label: str
    description: str
    filename: str
    columns: list[str]
    build: Callable[[Session, int, ExportConfig], list[list]]


# ---- helpers --------------------------------------------------------------------


def _months(config: ExportConfig):
    return fe.iterate_months(config.from_year, config.from_month, config.to_year, config.to_month)


def _current_idx() -> int:
    today = date.today()
    return fe.month_index(today.year, today.month)


def _yes_no(value: bool) -> str:
    return "sim" if value else "não"


def _month_of(d: date | None) -> int | None:
    return fe.month_index(d.year, d.month) if d else None


def _overlaps(start: int, end: int | None, config: ExportConfig) -> bool:
    return start <= config.to_idx and (end is None or end >= config.from_idx)


def _review_lookup(db: Session, model, fk, ids: list[int]) -> dict[tuple[int, int, int], str]:
    if not ids:
        return {}
    rows = db.query(model).filter(fk.in_(ids)).all()
    return {(getattr(r, fk.key), r.year, r.month): r.status.value for r in rows}


# ---- datasets -------------------------------------------------------------------


def _build_monthly_summary(db: Session, user_id: int, config: ExportConfig) -> list[list]:
    series = fe.get_balance_series(
        db, user_id, config.from_year, config.from_month, config.to_year, config.to_month
    )
    return [
        [p.year, p.month, p.entries_total, p.expenses_total, p.balance, p.cumulative_balance, _yes_no(p.is_projected)]
        for p in series
    ]


def _build_monthly_items(db: Session, user_id: int, config: ExportConfig) -> list[list]:
    current = _current_idx()
    entry_reviews = _review_lookup(
        db, EntryOccurrenceReview, EntryOccurrenceReview.entry_id,
        [e.id for e in db.query(Entry.id).filter(Entry.user_id == user_id, Entry.is_planned.is_(True))],
    )
    expense_reviews = _review_lookup(
        db, ExpenseOccurrenceReview, ExpenseOccurrenceReview.expense_id,
        [e.id for e in db.query(Expense.id).filter(Expense.user_id == user_id, Expense.is_planned.is_(True))],
    )

    def review_status(lookup, record, year, month) -> str:
        if not (record.is_planned and record.type == RecurrenceType.FIXED):
            return ""
        return REVIEW_LABEL.get(lookup.get((record.id, year, month)), "Pendente")

    rows: list[list] = []
    for year, month in _months(config):
        projected = _yes_no(fe.month_index(year, month) > current)
        summary = fe.get_month_summary(db, user_id, year, month)
        for e in summary.entries:
            rows.append([
                year, month, projected, "Entrada", e.id, e.description, e.source,
                RECURRENCE_LABEL[e.type], "", "", e.amount, e.currency.value,
                e.original_amount if e.type == RecurrenceType.EXCEPTIONAL else "",
                _yes_no(e.is_planned), review_status(entry_reviews, e, year, month),
            ])
        for x in summary.direct_expenses:
            rows.append([
                year, month, projected, "Saída", x.id, x.description, x.source,
                RECURRENCE_LABEL[x.type], PAYMENT_LABEL[x.payment_method], "", x.amount, x.currency.value,
                x.original_amount if x.type == RecurrenceType.EXCEPTIONAL else "",
                _yes_no(x.is_planned), review_status(expense_reviews, x, year, month),
            ])
        for i in summary.installments:
            purchase = i.expense
            rows.append([
                year, month, projected, "Saída", purchase.id, purchase.description, purchase.source,
                RECURRENCE_LABEL[purchase.type], PAYMENT_LABEL[purchase.payment_method],
                f"{i.installment_number}/{i.total_installments}", i.final_amount, "BRL", "", "não", "",
            ])
    return rows


def _build_records(db: Session, user_id: int, config: ExportConfig) -> list[list]:
    rows: list[list] = []
    entries = db.query(Entry).filter(Entry.user_id == user_id).order_by(Entry.date, Entry.id).all()
    for e in entries:
        if e.type == RecurrenceType.FIXED:
            touches = _overlaps(_month_of(e.start_date), _month_of(e.end_date), config)
        else:
            touches = config.from_idx <= _month_of(e.date) <= config.to_idx
        if not touches:
            continue
        rows.append([
            e.id, "Entrada", e.date, e.description, e.source, RECURRENCE_LABEL[e.type], "",
            e.start_date or "", e.end_date or "", e.amount, e.currency.value, e.original_amount,
            e.exchange_rate, e.exchange_rate_date, "", _yes_no(e.is_planned),
            _yes_no(e.counts_toward_dashboard), _yes_no(e.is_vault_locked),
        ])

    expenses = (
        db.query(Expense)
        .options(joinedload(Expense.installments))
        .filter(Expense.user_id == user_id)
        .order_by(Expense.date, Expense.id)
        .all()
    )
    for x in expenses:
        if x.payment_method == PaymentMethod.CREDITO:
            months = [fe.installment_effective_month_index(i) for i in x.installments]
            touches = bool(months) and _overlaps(min(months), max(months), config)
        elif x.type == RecurrenceType.FIXED:
            touches = _overlaps(_month_of(x.start_date), _month_of(x.end_date), config)
        else:
            touches = config.from_idx <= _month_of(x.date) <= config.to_idx
        if not touches:
            continue
        rows.append([
            x.id, "Saída", x.date, x.description, x.source, RECURRENCE_LABEL[x.type],
            PAYMENT_LABEL[x.payment_method], x.start_date or "", x.end_date or "", x.amount,
            x.currency.value, x.original_amount, x.exchange_rate, x.exchange_rate_date,
            len(x.installments) or "", _yes_no(x.is_planned), "sim", _yes_no(x.is_vault_locked),
        ])
    return rows


def _build_installments(db: Session, user_id: int, config: ExportConfig) -> list[list]:
    current = _current_idx()
    installments = (
        db.query(Installment)
        .join(Expense, Installment.expense_id == Expense.id)
        .filter(Expense.user_id == user_id)
        .options(joinedload(Installment.adjustments), joinedload(Installment.expense))
        .order_by(Installment.due_date, Installment.expense_id, Installment.installment_number)
        .all()
    )
    rows: list[list] = []
    for i in installments:
        effective = fe.installment_effective_month_index(i)
        if not config.from_idx <= effective <= config.to_idx:
            continue
        y, m = divmod(effective - 1, 12)
        adjustments = sum((a.amount for a in i.adjustments), Decimal("0.00"))
        rows.append([
            i.expense_id, i.expense.description, i.expense.source, i.installment_number,
            i.total_installments, i.due_date, f"{m + 1:02d}/{y}",
            _yes_no(i.advanced_to_year is not None), i.base_amount, adjustments, i.final_amount,
            _yes_no(effective > current),
        ])
    return rows


def _build_vault(db: Session, user_id: int, config: ExportConfig) -> list[list]:
    transactions = (
        db.query(VaultTransaction)
        .filter(VaultTransaction.user_id == user_id)
        .order_by(VaultTransaction.date, VaultTransaction.id)
        .all()
    )
    rows: list[list] = []
    for t in transactions:
        if not config.from_idx <= _month_of(t.date) <= config.to_idx:
            continue
        rows.append([
            t.id, t.date, VAULT_LABEL[t.type.value], t.description, t.amount,
            CARVE_LABEL.get(t.carve_mode.value, "") if t.carve_mode else "",
            t.carve_percentage if t.carve_percentage is not None else "",
            t.source_entry_id or "",
        ])
    return rows


DATASETS: dict[str, Dataset] = {
    d.key: d
    for d in [
        Dataset(
            "monthly_summary",
            "Resumo mensal",
            "Uma linha por mês: totais de entradas e saídas, saldo do mês e saldo acumulado - os mesmos números dos gráficos do dashboard, incluindo os meses projetados.",
            "resumo_mensal.csv",
            ["ano", "mes", "entradas_brl", "saidas_brl", "saldo_do_mes_brl", "saldo_acumulado_brl", "projetado"],
            _build_monthly_summary,
        ),
        Dataset(
            "monthly_items",
            "Lançamentos mês a mês",
            "Cada lançamento em cada mês em que ele conta: regras fixas repetidas mês a mês, parcelas no mês em que caem e revisões de planejados aplicadas. Inclui os meses projetados.",
            "lancamentos_por_mes.csv",
            [
                "ano", "mes", "projetado", "movimento", "lancamento_id", "descricao", "fonte", "recorrencia",
                "meio_pagamento", "parcela", "valor_brl", "moeda_original", "valor_original", "planejado",
                "revisao_do_mes",
            ],
            _build_monthly_items,
        ),
        Dataset(
            "records",
            "Cadastro de lançamentos",
            "Os registros como foram cadastrados (uma linha por entrada/saída), com cotação usada na conversão. Só os que têm algum efeito dentro do período.",
            "cadastro_de_lancamentos.csv",
            [
                "id", "movimento", "data", "descricao", "fonte", "recorrencia", "meio_pagamento", "inicio", "fim",
                "valor_brl", "moeda", "valor_original", "cotacao", "data_cotacao", "parcelas", "planejado",
                "conta_no_saldo", "gerado_pelo_cofre",
            ],
            _build_records,
        ),
        Dataset(
            "installments",
            "Parcelas do cartão",
            "Cada parcela de compra no crédito que cai no período, com ajustes e antecipações.",
            "parcelas.csv",
            [
                "compra_id", "descricao", "fonte", "parcela", "total_parcelas", "vencimento", "mes_em_que_conta",
                "antecipada", "valor_base_brl", "ajustes_brl", "valor_final_brl", "projetado",
            ],
            _build_installments,
        ),
        Dataset(
            "vault",
            "Movimentações do Cofre",
            "Depósitos, recortes e retiradas do Cofre no período. O Cofre não tem projeção.",
            "cofre.csv",
            ["id", "data", "tipo", "descricao", "valor_brl", "modo_recorte", "percentual_recorte", "entrada_origem_id"],
            _build_vault,
        ),
    ]
}


# ---- validation and rendering ---------------------------------------------------------


def validate(config: ExportConfig) -> None:
    if not config.datasets:
        raise ValidationAppError("Selecione ao menos um conjunto de dados.")
    unknown = [d for d in config.datasets if d not in DATASETS]
    if unknown:
        raise ValidationAppError(f"Conjunto de dados desconhecido: {', '.join(unknown)}.")
    if config.format not in ("excel_br", "standard"):
        raise ValidationAppError("Formato desconhecido.")
    if config.from_idx > config.to_idx:
        raise ValidationAppError("O mês inicial não pode ser depois do mês final.")
    if config.to_idx - config.from_idx + 1 > MAX_SPAN_MONTHS:
        raise ValidationAppError(f"O período pode ter no máximo {MAX_SPAN_MONTHS} meses.")
    today = date.today()
    horizon = fe.shift_month(today.year, today.month, fe.MAX_HORIZON_MONTHS)
    if config.to_idx > fe.month_index(*horizon):
        raise ValidationAppError(
            f"O período passa do limite de projeção ({fe.MAX_HORIZON_MONTHS} meses à frente)."
        )


def _cell(value, decimal_comma: bool) -> str:
    if isinstance(value, Decimal):
        text = format(value, "f")
        return text.replace(".", ",") if decimal_comma else text
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _to_csv(columns: list[str], rows: list[list], fmt: str) -> bytes:
    decimal_comma = fmt == "excel_br"
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";" if decimal_comma else ",", lineterminator="\r\n")
    writer.writerow(columns)
    for row in rows:
        writer.writerow([_cell(v, decimal_comma) for v in row])
    # BOM so Excel detects UTF-8 (accents in descriptions) without an import wizard.
    return ("﻿" + buffer.getvalue()).encode("utf-8")


def _period_suffix(config: ExportConfig) -> str:
    return f"{config.from_year}-{config.from_month:02d}_a_{config.to_year}-{config.to_month:02d}"


def build_preview(db: Session, user_id: int, config: ExportConfig) -> list[dict]:
    validate(config)
    preview = []
    for key in config.datasets:
        dataset = DATASETS[key]
        rows = dataset.build(db, user_id, config)
        decimal_comma = config.format == "excel_br"
        preview.append({
            "key": dataset.key,
            "label": dataset.label,
            "filename": dataset.filename,
            "columns": dataset.columns,
            "rows": [[_cell(v, decimal_comma) for v in row] for row in rows[:PREVIEW_ROWS]],
            "total_rows": len(rows),
        })
    return preview


def build_export(db: Session, user_id: int, config: ExportConfig) -> tuple[bytes, str, str]:
    """(content, filename, media type) - a single CSV, or a zip when several datasets
    were selected."""
    validate(config)
    suffix = _period_suffix(config)
    files = []
    for key in config.datasets:
        dataset = DATASETS[key]
        content = _to_csv(dataset.columns, dataset.build(db, user_id, config), config.format)
        files.append((dataset.filename.replace(".csv", f"_{suffix}.csv"), content))

    if len(files) == 1:
        name, content = files[0]
        return content, f"cartuga_{name}", "text/csv; charset=utf-8"

    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in files:
            zf.writestr(name, content)
    return archive.getvalue(), f"cartuga_dados_{suffix}.zip", "application/zip"
