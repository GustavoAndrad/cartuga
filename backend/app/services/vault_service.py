"""Cofre (vault): money set aside outside the normal cashflow.

A VaultTransaction is never the source of truth for an amount by itself - it always
points at the real Entry (DEPOSIT_FRESH/WITHDRAWAL) or Expense (DEPOSIT_CARVE) that
represents it in the ledger. That's what lets "does this count toward the dashboard"
stay a single, ordinary finance_engine concern (Entry.counts_toward_dashboard / a
normal expense) instead of a second parallel calculation to keep in sync.
"""

from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.constants import VAULT_SOURCE_LABEL
from app.models.entry import Entry
from app.models.enums import CarveMode, Currency, PaymentMethod, RecurrenceType, VaultTransactionType
from app.models.expense import Expense
from app.models.vault_transaction import VaultTransaction
from app.repositories import entry_repository, vault_repository
from app.schemas.vault import VaultTransactionCreate
from app.services import entry_service
from app.services.finance_engine import month_index
from app.utils.errors import NotFoundError, ValidationAppError

ZERO = Decimal("0")
CENTS = Decimal("0.01")
SOURCE_LABEL = VAULT_SOURCE_LABEL


def list_vault_transactions(db: Session, user_id: int) -> list[VaultTransaction]:
    return vault_repository.list_all(db, user_id)


def get_vault_transaction(db: Session, user_id: int, transaction_id: int) -> VaultTransaction:
    transaction = vault_repository.get(db, user_id, transaction_id)
    if transaction is None:
        raise NotFoundError("Movimentação do cofre não encontrada.")
    return transaction


def _remaining_carveable(db: Session, entry: Entry) -> Decimal:
    already = sum((c.amount for c in vault_repository.list_carves_for_entry(db, entry.id)), ZERO)
    return entry.amount - already


@dataclass
class CarveableEntry:
    entry: Entry
    remaining_amount: Decimal


def list_carveable_entries(db: Session, user_id: int) -> list[CarveableEntry]:
    """Entries eligible as a recorte source: real, dashboard-counted, one-off
    (EXCEPTIONAL) entries that still have some un-carved amount left.

    FIXED entries are excluded: the cumulative 100% cap only makes sense against a
    single fixed amount, but a FIXED entry posts that same amount again every month it
    is active - "how much is left to carve" has no sensible answer for it."""
    result = []
    for entry in entry_repository.list_all(db, user_id):
        if not entry.counts_toward_dashboard:
            continue
        if entry.type != RecurrenceType.EXCEPTIONAL:
            continue
        remaining = _remaining_carveable(db, entry)
        if remaining > 0:
            result.append(CarveableEntry(entry=entry, remaining_amount=remaining))
    return result


def _create_deposit_fresh(db: Session, user_id: int, payload: VaultTransactionCreate) -> VaultTransaction:
    entry = Entry(
        user_id=user_id,
        date=payload.date,
        amount=payload.amount,
        currency=Currency.BRL,
        description=payload.description,
        source=SOURCE_LABEL,
        type=RecurrenceType.EXCEPTIONAL,
        counts_toward_dashboard=False,
    )
    db.add(entry)
    db.flush()
    return VaultTransaction(
        user_id=user_id,
        type=VaultTransactionType.DEPOSIT_FRESH,
        date=payload.date,
        amount=payload.amount,
        description=payload.description,
        entry_id=entry.id,
    )


def _create_withdrawal(db: Session, user_id: int, payload: VaultTransactionCreate) -> VaultTransaction:
    balance = get_vault_balance(db, user_id)
    if payload.amount > balance:  # type: ignore[operator]
        raise ValidationAppError(
            f"A retirada excede o saldo guardado no cofre (saldo atual: R$ {balance:.2f})."
        )

    entry = Entry(
        user_id=user_id,
        date=payload.date,
        amount=payload.amount,
        currency=Currency.BRL,
        description=payload.description,
        source=SOURCE_LABEL,
        type=RecurrenceType.EXCEPTIONAL,
        counts_toward_dashboard=True,
    )
    db.add(entry)
    db.flush()
    return VaultTransaction(
        user_id=user_id,
        type=VaultTransactionType.WITHDRAWAL,
        date=payload.date,
        amount=payload.amount,
        description=payload.description,
        entry_id=entry.id,
    )


def _create_deposit_carve(db: Session, user_id: int, payload: VaultTransactionCreate) -> VaultTransaction:
    source_entry = entry_service.get_entry(db, user_id, payload.source_entry_id)  # type: ignore[arg-type]
    if not source_entry.counts_toward_dashboard:
        raise ValidationAppError("Não é possível recortar uma entrada que não conta para o dashboard.")
    if source_entry.type != RecurrenceType.EXCEPTIONAL:
        raise ValidationAppError(
            "Só é possível recortar entradas Excepcionais. Uma entrada Fixa se repete "
            "todo mês, então não tem um valor único do qual recortar uma parte."
        )

    remaining = _remaining_carveable(db, source_entry)
    if payload.carve_mode == CarveMode.PERCENTAGE:
        carve_amount = (source_entry.amount * payload.carve_value / Decimal("100")).quantize(  # type: ignore[operator]
            CENTS, rounding=ROUND_HALF_UP
        )
    else:
        carve_amount = payload.carve_value.quantize(CENTS, rounding=ROUND_HALF_UP)  # type: ignore[union-attr]

    if carve_amount <= 0:
        raise ValidationAppError("O valor do recorte deve ser maior que zero.")
    if carve_amount > remaining:
        raise ValidationAppError(
            f"O recorte excede o valor disponível dessa entrada (restam R$ {remaining:.2f})."
        )

    expense = Expense(
        user_id=user_id,
        date=payload.date,
        amount=carve_amount,
        currency=Currency.BRL,
        description=payload.description,
        source=SOURCE_LABEL,
        type=RecurrenceType.EXCEPTIONAL,
        payment_method=PaymentMethod.CONTA,
    )
    db.add(expense)
    db.flush()
    return VaultTransaction(
        user_id=user_id,
        type=VaultTransactionType.DEPOSIT_CARVE,
        date=payload.date,
        amount=carve_amount,
        description=payload.description,
        expense_id=expense.id,
        source_entry_id=source_entry.id,
        carve_mode=payload.carve_mode,
        carve_percentage=payload.carve_value if payload.carve_mode == CarveMode.PERCENTAGE else None,
    )


_BUILDERS = {
    VaultTransactionType.DEPOSIT_FRESH: _create_deposit_fresh,
    VaultTransactionType.WITHDRAWAL: _create_withdrawal,
    VaultTransactionType.DEPOSIT_CARVE: _create_deposit_carve,
}


def create_vault_transaction(db: Session, user_id: int, payload: VaultTransactionCreate) -> VaultTransaction:
    transaction = _BUILDERS[payload.type](db, user_id, payload)
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return get_vault_transaction(db, user_id, transaction.id)  # reload with joined entry/expense/source


def delete_vault_transaction(db: Session, user_id: int, transaction_id: int) -> None:
    """Deletes the real entry/expense the transaction represents - the vault_transaction
    row itself is removed automatically via ON DELETE CASCADE."""
    transaction = get_vault_transaction(db, user_id, transaction_id)
    if transaction.entry_id is not None:
        entry = db.query(Entry).filter(Entry.id == transaction.entry_id).first()
        if entry is not None:
            db.delete(entry)
    if transaction.expense_id is not None:
        expense = db.query(Expense).filter(Expense.id == transaction.expense_id).first()
        if expense is not None:
            db.delete(expense)
    db.commit()


@dataclass
class VaultMonthPoint:
    year: int
    month: int
    deposits_total: Decimal
    withdrawals_total: Decimal
    net: Decimal
    cumulative_balance: Decimal


@dataclass
class VaultSummary:
    balance: Decimal
    total_deposited: Decimal
    total_withdrawn: Decimal
    monthly_series: list[VaultMonthPoint] = field(default_factory=list)


def _build_monthly_series(transactions: list[VaultTransaction]) -> list[VaultMonthPoint]:
    if not transactions:
        return []

    by_month: dict[tuple[int, int], dict[str, Decimal]] = {}
    for t in transactions:
        key = (t.date.year, t.date.month)
        bucket = by_month.setdefault(key, {"deposits": ZERO, "withdrawals": ZERO})
        if t.type == VaultTransactionType.WITHDRAWAL:
            bucket["withdrawals"] += t.amount
        else:
            bucket["deposits"] += t.amount

    today = date.today()
    start_year, start_month = min(by_month.keys())
    end_year, end_month = max(max(by_month.keys()), (today.year, today.month))
    end_idx = month_index(end_year, end_month)

    points: list[VaultMonthPoint] = []
    cumulative = ZERO
    year, month = start_year, start_month
    while month_index(year, month) <= end_idx:
        bucket = by_month.get((year, month), {"deposits": ZERO, "withdrawals": ZERO})
        net = bucket["deposits"] - bucket["withdrawals"]
        cumulative += net
        points.append(
            VaultMonthPoint(
                year=year,
                month=month,
                deposits_total=bucket["deposits"],
                withdrawals_total=bucket["withdrawals"],
                net=net,
                cumulative_balance=cumulative,
            )
        )
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)

    return points


def get_vault_summary(db: Session, user_id: int) -> VaultSummary:
    transactions = vault_repository.list_all(db, user_id)
    total_deposited = sum(
        (t.amount for t in transactions if t.type != VaultTransactionType.WITHDRAWAL), ZERO
    )
    total_withdrawn = sum(
        (t.amount for t in transactions if t.type == VaultTransactionType.WITHDRAWAL), ZERO
    )
    return VaultSummary(
        balance=total_deposited - total_withdrawn,
        total_deposited=total_deposited,
        total_withdrawn=total_withdrawn,
        monthly_series=_build_monthly_series(transactions),
    )


def get_vault_balance(db: Session, user_id: int) -> Decimal:
    transactions = vault_repository.list_all(db, user_id)
    total_deposited = sum(
        (t.amount for t in transactions if t.type != VaultTransactionType.WITHDRAWAL), ZERO
    )
    total_withdrawn = sum(
        (t.amount for t in transactions if t.type == VaultTransactionType.WITHDRAWAL), ZERO
    )
    return total_deposited - total_withdrawn
