from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.constants import VAULT_SOURCE_LABEL
from app.models.entry import Entry
from app.models.enums import OccurrenceReviewStatus, RecurrenceType
from app.repositories import entry_occurrence_review_repository, entry_repository, vault_repository
from app.schemas.entry import EntryCreate, EntryUpdate
from app.services import exchange_rate_service
from app.services.finance_engine import month_index
from app.utils.errors import NotFoundError, ValidationAppError

# A Cofre deposit/withdrawal mirrors its amount/date into vault_transactions at
# creation time (see vault_service) - it is never recalculated from the entry, so
# editing these fields here would silently desync the two. Worse, flipping `type` to
# FIXED would make the dashboard count the same amount every month while the Cofre
# still treats it as the single event it was created as - real double-counting.
# `source` is locked too (unlike a CREDITO expense's freely-editable source): it's the
# exact "Investimento" label the vault icon on Entradas/Saídas keys off of, so letting
# it drift would make a genuinely locked entry stop looking like one. Only the
# description is left free to personalize.
_VAULT_LOCKED_FIELDS = ("date", "currency", "type", "source")


def _resolve_currency(data: dict) -> dict:
    """Converts the entered amount (in `data["currency"]`) to its BRL equivalent using
    the rate as of `data["date"]`, and fills in the FX snapshot fields alongside it."""
    original_amount = data["amount"]
    amount_brl, rate, rate_date = exchange_rate_service.convert_to_brl(
        original_amount, data["currency"], data["date"]
    )
    data["original_amount"] = original_amount
    data["amount"] = amount_brl
    data["exchange_rate"] = rate
    data["exchange_rate_date"] = rate_date
    return data


def list_entries(db: Session, user_id: int) -> list[Entry]:
    return entry_repository.list_all(db, user_id)


def get_entry(db: Session, user_id: int, entry_id: int) -> Entry:
    entry = entry_repository.get(db, user_id, entry_id)
    if entry is None:
        raise NotFoundError("Entrada não encontrada.")
    return entry


def _will_be_fixed_planned(type_: RecurrenceType, is_planned: bool) -> bool:
    return type_ == RecurrenceType.FIXED and is_planned


def create_entry(db: Session, user_id: int, payload: EntryCreate) -> Entry:
    if payload.source == VAULT_SOURCE_LABEL:
        raise ValidationAppError(
            f'A fonte "{VAULT_SOURCE_LABEL}" é reservada para movimentações do Cofre.'
        )
    data = _resolve_currency(payload.model_dump())
    # A FIXED rule has no single "did this happen" moment like an EXCEPTIONAL entry's
    # own `date` - is_planned_since anchors where planning_service starts looking for
    # unreviewed monthly occurrences, so marking an old rule Planejado doesn't flood
    # the review queue with every past month.
    if _will_be_fixed_planned(data["type"], data["is_planned"]):
        data["is_planned_since"] = date.today()
    entry = Entry(user_id=user_id, **data)
    return entry_repository.create(db, entry)


def update_entry(db: Session, user_id: int, entry_id: int, payload: EntryUpdate) -> Entry:
    entry = get_entry(db, user_id, entry_id)
    vault_transaction = vault_repository.get_by_entry_id(db, entry_id)

    if vault_transaction is not None:
        new_values = payload.model_dump()
        locked_changed = any(new_values[field] != getattr(entry, field) for field in _VAULT_LOCKED_FIELDS)
        amount_changed = new_values["amount"] != entry.original_amount
        if locked_changed or amount_changed:
            raise ValidationAppError(
                "Apenas a descrição de uma movimentação gerada pelo Cofre pode ser alterada "
                "por aqui. Para desfazer, exclua a movimentação na tela do Cofre."
            )
        entry.description = payload.description
        # vault_transactions.description is a snapshot, not a live join (see
        # VaultTransaction's docstring) - keep it in sync or the Cofre screen would
        # keep showing the old description after a rename here.
        vault_transaction.description = payload.description
        db.commit()
        db.refresh(entry)
        return entry

    if payload.source == VAULT_SOURCE_LABEL:
        raise ValidationAppError(
            f'A fonte "{VAULT_SOURCE_LABEL}" é reservada para movimentações do Cofre.'
        )

    data = _resolve_currency(payload.model_dump())
    was_fixed_planned = _will_be_fixed_planned(entry.type, entry.is_planned)
    will_be_fixed_planned = _will_be_fixed_planned(data["type"], data["is_planned"])
    if will_be_fixed_planned and not was_fixed_planned:
        data["is_planned_since"] = date.today()
    elif was_fixed_planned and not will_be_fixed_planned:
        data["is_planned_since"] = None
    for field, value in data.items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


def delete_entry(db: Session, user_id: int, entry_id: int) -> None:
    entry = get_entry(db, user_id, entry_id)
    entry_repository.delete(db, entry)


def _validate_fixed_planned_occurrence(entry: Entry, year: int, month: int) -> None:
    if not _will_be_fixed_planned(entry.type, entry.is_planned):
        raise ValidationAppError("Esta entrada não é uma Fixa Planejada.")
    if entry.is_planned_since is None:
        raise ValidationAppError("Esta entrada não possui um período de revisão definido.")

    target_idx = month_index(year, month)
    review_start_idx = max(
        month_index(entry.is_planned_since.year, entry.is_planned_since.month),
        month_index(entry.start_date.year, entry.start_date.month),
    )
    if target_idx < review_start_idx:
        raise ValidationAppError("Esse mês é anterior ao início da revisão desta entrada.")
    if entry.end_date is not None and target_idx > month_index(entry.end_date.year, entry.end_date.month):
        raise ValidationAppError("Esse mês está fora do período ativo desta entrada.")


def confirm_entry_occurrence(
    db: Session, user_id: int, entry_id: int, year: int, month: int, amount: Decimal | None
):
    entry = get_entry(db, user_id, entry_id)
    _validate_fixed_planned_occurrence(entry, year, month)
    return entry_occurrence_review_repository.upsert(
        db, entry.id, year, month, OccurrenceReviewStatus.CONFIRMED, amount
    )


def reject_entry_occurrence(db: Session, user_id: int, entry_id: int, year: int, month: int):
    entry = get_entry(db, user_id, entry_id)
    _validate_fixed_planned_occurrence(entry, year, month)
    return entry_occurrence_review_repository.upsert(db, entry.id, year, month, OccurrenceReviewStatus.REJECTED, None)
