"""Bank statement CSV import: turns a raw Inter/Nubank extract into draft Cartuga
records (Entrada/Saída/Guardar/Retirar) for the user to review and edit before
anything touches the database. `commit_rows` then replays each reviewed row through
the very same entry_service/expense_service/vault_service used by the normal
single-record endpoints - every invariant they enforce (FX freeze, the "Investimento"
reserved source word, the vault balance cap, ...) applies identically here, with no
parallel validation logic to keep in sync.

Classification is deliberately a best-effort heuristic, not an exhaustive parser of
every possible transaction label a bank might print: the review screen lets the user
fix/reclassify/delete any row before anything is committed, so a wrong guess here is
never destructive - it just means one more click in review.
"""

import csv
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models.enums import PaymentMethod, RecurrenceType, VaultTransactionType
from app.repositories import entry_repository, expense_repository
from app.schemas.bank_import import (
    BankImportPreviewOut,
    BankName,
    ImportCommitOut,
    ImportKind,
    ImportRow,
    ImportRowResult,
)
from app.schemas.entry import EntryCreate
from app.schemas.expense import ExpenseCreate
from app.schemas.vault import VaultTransactionCreate
from app.services import entry_service, expense_service, vault_service
from app.utils.errors import ValidationAppError

MAX_ROWS = 5000

# Markers that, combined with the right Histórico/Descrição context, identify a
# checking<->investment transfer rather than a regular Pix/transfer.
_INVEST_MARKERS = ("cdb", "rdb", "aplicaç", "aplicac", "resgate", "fundo")


class BankImportFileError(ValidationAppError):
    pass


def _decode(content: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def _parse_brl_decimal(raw: str) -> Decimal | None:
    """Brazilian format: '.' thousands separator, ',' decimal separator (e.g. "1.574,22")."""
    raw = raw.strip()
    if not raw:
        return None
    negative = raw.startswith("-")
    raw = raw.lstrip("+-").replace(".", "").replace(",", ".")
    try:
        value = Decimal(raw)
    except InvalidOperation:
        return None
    return -value if negative else value


def _parse_plain_decimal(raw: str) -> Decimal | None:
    raw = raw.strip()
    if not raw:
        return None
    try:
        return Decimal(raw)
    except InvalidOperation:
        return None


def _parse_br_date(raw: str) -> date | None:
    try:
        return datetime.strptime(raw.strip(), "%d/%m/%Y").date()
    except ValueError:
        return None


def _extract_nubank_counterparty(descricao: str) -> str:
    """Nubank's Descrição is a compound sentence like "Transferência recebida pelo Pix
    - NAME - CPF - BANK ..." - the counterparty name is consistently the 2nd segment."""
    parts = [p.strip() for p in descricao.split(" - ") if p.strip()]
    if len(parts) >= 2:
        return parts[1]
    return descricao.strip()


def _find_header(lines: list[str], delimiter: str, must_contain: tuple[str, ...]) -> int | None:
    for idx, line in enumerate(lines):
        cells = [c.strip().lower() for c in line.split(delimiter)]
        if all(any(token in cell for cell in cells) for token in must_contain):
            return idx
    return None


def _decoded_lines(content: bytes, delimiter: str) -> tuple[list[str], int]:
    """Decodes `content` and locates its header row. The header-token scan (not just
    the absence of a UnicodeDecodeError) is what actually detects a bad decode: mojibake
    from a wrong-but-valid encoding guess decodes without error but never matches."""
    text = _decode(content)
    lines = [ln for ln in text.splitlines() if ln.strip() != ""]
    header_idx = _find_header(lines, delimiter, ("data", "valor"))
    if header_idx is None:
        text = content.decode("cp1252", errors="replace")
        lines = [ln for ln in text.splitlines() if ln.strip() != ""]
        header_idx = _find_header(lines, delimiter, ("data", "valor"))
    if header_idx is None:
        raise BankImportFileError(
            "Não foi possível identificar o cabeçalho do extrato. Confirme que o "
            "arquivo e o banco selecionado correspondem ao extrato exportado."
        )
    return lines, header_idx


def _check_row_limit(count: int) -> None:
    if count > MAX_ROWS:
        raise BankImportFileError(f"O arquivo excede o limite de {MAX_ROWS} linhas.")


def _parse_inter(content: bytes) -> list[ImportRow]:
    lines, header_idx = _decoded_lines(content, ";")

    rows: list[ImportRow] = []
    reader = csv.reader(lines[header_idx + 1 :], delimiter=";")
    for line_no, cells in enumerate(reader, start=header_idx + 2):
        if len(cells) < 4 or not any(c.strip() for c in cells):
            continue
        cells = (cells + [""] * 5)[:5]
        data_str, historico, descricao, valor_str, _saldo = cells
        historico_norm = historico.strip().lower()
        descricao_norm = descricao.strip().lower()

        parsed_date = _parse_br_date(data_str)
        amount = _parse_brl_decimal(valor_str)
        warnings: list[str] = []
        if parsed_date is None:
            warnings.append("Data não identificada: preencha manualmente.")
        if amount is None:
            warnings.append("Valor não identificado: preencha manualmente.")

        is_investment = historico_norm in ("aplicação", "aplicacao", "resgate") and any(
            marker in descricao_norm for marker in _INVEST_MARKERS
        )
        if is_investment:
            kind = ImportKind.GUARDAR if historico_norm.startswith("aplic") else ImportKind.RETIRAR
            description = "Aplicação no Cofre" if kind == ImportKind.GUARDAR else "Resgate do Cofre"
            source = ""
            payment_method = None
        else:
            kind = ImportKind.SAIDA if (amount is not None and amount < 0) else ImportKind.ENTRADA
            description = descricao.strip() or historico.strip() or "Importado do extrato"
            source = description
            payment_method = PaymentMethod.CONTA if kind == ImportKind.SAIDA else None

        rows.append(
            ImportRow(
                kind=kind,
                date=parsed_date,
                amount=abs(amount) if amount is not None else None,
                description=description,
                source=source,
                payment_method=payment_method,
                warnings=warnings,
                raw={
                    "linha": str(line_no),
                    "data": data_str,
                    "historico": historico.strip(),
                    "descricao": descricao.strip(),
                    "valor": valor_str.strip(),
                },
            )
        )
        _check_row_limit(len(rows))

    return rows


def _parse_nubank(content: bytes) -> list[ImportRow]:
    lines, header_idx = _decoded_lines(content, ",")

    rows: list[ImportRow] = []
    reader = csv.reader(lines[header_idx + 1 :], delimiter=",")
    for line_no, cells in enumerate(reader, start=header_idx + 2):
        if len(cells) < 2 or not any(c.strip() for c in cells):
            continue
        cells = (cells + [""] * 4)[:4]
        data_str, valor_str, _identificador, descricao = cells
        descricao_norm = descricao.strip().lower()

        parsed_date = _parse_br_date(data_str)
        amount = _parse_plain_decimal(valor_str)
        warnings: list[str] = []
        if parsed_date is None:
            warnings.append("Data não identificada: preencha manualmente.")
        if amount is None:
            warnings.append("Valor não identificado: preencha manualmente.")

        has_invest_marker = any(m in descricao_norm for m in ("rdb", "cdb", "fundo"))
        if "resgate" in descricao_norm and has_invest_marker:
            kind = ImportKind.RETIRAR
            description = "Resgate do Cofre"
            source = ""
            payment_method = None
        elif ("aplicaç" in descricao_norm or "aplicac" in descricao_norm) and has_invest_marker:
            kind = ImportKind.GUARDAR
            description = "Aplicação no Cofre"
            source = ""
            payment_method = None
        else:
            kind = ImportKind.SAIDA if (amount is not None and amount < 0) else ImportKind.ENTRADA
            description = _extract_nubank_counterparty(descricao) or "Importado do extrato"
            source = description
            payment_method = PaymentMethod.CONTA if kind == ImportKind.SAIDA else None

        rows.append(
            ImportRow(
                kind=kind,
                date=parsed_date,
                amount=abs(amount) if amount is not None else None,
                description=description,
                source=source,
                payment_method=payment_method,
                warnings=warnings,
                raw={"linha": str(line_no), "data": data_str, "descricao": descricao.strip(), "valor": valor_str.strip()},
            )
        )
        _check_row_limit(len(rows))

    return rows


_PARSERS = {BankName.INTER: _parse_inter, BankName.NUBANK: _parse_nubank}


def parse_file(bank: BankName, content: bytes) -> BankImportPreviewOut:
    if not content:
        raise BankImportFileError("O arquivo está vazio.")
    rows = _PARSERS[bank](content)
    file_warnings: list[str] = []
    if not rows:
        file_warnings.append("Nenhum lançamento foi identificado no arquivo.")
    return BankImportPreviewOut(rows=rows, file_warnings=file_warnings)


def _flag_possible_duplicates(db: Session, user_id: int, rows: list[ImportRow]) -> None:
    existing_entries = {
        (e.date, e.original_amount, e.description.strip().lower()) for e in entry_repository.list_all(db, user_id)
    }
    existing_expenses = {
        (e.date, e.original_amount, e.description.strip().lower()) for e in expense_repository.list_all(db, user_id)
    }
    for row in rows:
        if row.date is None or row.amount is None:
            continue
        key = (row.date, row.amount, row.description.strip().lower())
        if row.kind == ImportKind.ENTRADA and key in existing_entries:
            row.warnings.append("Possível duplicata: já existe uma entrada igual nesta data.")
        elif row.kind == ImportKind.SAIDA and key in existing_expenses:
            row.warnings.append("Possível duplicata: já existe uma saída igual nesta data.")


def preview(db: Session, user_id: int, bank: BankName, content: bytes) -> BankImportPreviewOut:
    result = parse_file(bank, content)
    _flag_possible_duplicates(db, user_id, result.rows)
    return result


def _commit_one(db: Session, user_id: int, row: ImportRow) -> ImportRowResult:
    if row.date is None:
        return ImportRowResult(index=-1, status="error", message="Data obrigatória.")
    if row.amount is None or row.amount <= 0:
        return ImportRowResult(index=-1, status="error", message="O valor deve ser maior que zero.")

    try:
        if row.kind == ImportKind.ENTRADA:
            payload = EntryCreate(
                date=row.date,
                amount=row.amount,
                description=row.description or "Importado",
                source=row.source or row.description or "Importado",
                type=RecurrenceType.EXCEPTIONAL,
            )
            entry = entry_service.create_entry(db, user_id, payload)
            return ImportRowResult(index=-1, status="created", entry_id=entry.id)

        if row.kind == ImportKind.SAIDA:
            payload = ExpenseCreate(
                date=row.date,
                amount=row.amount,
                description=row.description or "Importado",
                source=row.source or row.description or "Importado",
                type=RecurrenceType.EXCEPTIONAL,
                payment_method=row.payment_method or PaymentMethod.CONTA,
            )
            expense = expense_service.create_expense(db, user_id, payload)
            return ImportRowResult(index=-1, status="created", expense_id=expense.id)

        vault_type = VaultTransactionType.DEPOSIT_FRESH if row.kind == ImportKind.GUARDAR else VaultTransactionType.WITHDRAWAL
        default_description = "Guardado via importação" if row.kind == ImportKind.GUARDAR else "Retirado via importação"
        payload = VaultTransactionCreate(
            type=vault_type,
            date=row.date,
            description=row.description or default_description,
            amount=row.amount,
        )
        transaction = vault_service.create_vault_transaction(db, user_id, payload)
        return ImportRowResult(index=-1, status="created", vault_transaction_id=transaction.id)
    except (ValidationAppError, ValidationError) as exc:
        db.rollback()
        message = exc.errors()[0]["msg"] if isinstance(exc, ValidationError) else str(exc)
        return ImportRowResult(index=-1, status="error", message=message)


def commit_rows(db: Session, user_id: int, rows: list[ImportRow]) -> ImportCommitOut:
    _check_row_limit(len(rows))

    # Chronological order matters for GUARDAR/RETIRAR: the vault balance cap is checked
    # against whatever is already committed, so a withdrawal must land after the
    # deposits that fund it - the same order the real bank events happened in,
    # regardless of what order the rows appear in the (already-edited) review list.
    ordered_indices = sorted(range(len(rows)), key=lambda i: rows[i].date or date.max)

    results: list[ImportRowResult] = []
    created = 0
    failed = 0
    for original_index in ordered_indices:
        result = _commit_one(db, user_id, rows[original_index])
        result.index = original_index
        results.append(result)
        if result.status == "created":
            created += 1
        else:
            failed += 1

    results.sort(key=lambda r: r.index)
    return ImportCommitOut(created=created, failed=failed, results=results)
