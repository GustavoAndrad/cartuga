from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.constants import VAULT_SOURCE_LABEL
from app.models.enums import OccurrenceReviewStatus, PaymentMethod, RecurrenceType
from app.models.expense import Expense
from app.models.installment import Installment
from app.repositories import expense_occurrence_review_repository, expense_repository, vault_repository
from app.schemas.expense import ExpenseCreate, ExpenseUpdate
from app.services import exchange_rate_service
from app.services.finance_engine import month_index
from app.services.installment_service import build_installment_plan
from app.utils.errors import NotFoundError, ValidationAppError

# For CREDITO expenses, the installment plan is derived once at creation time from
# date/amount/currency/installments_count. Changing any of them afterwards would
# silently invalidate already-generated installments (and any adjustments applied to
# them), so the general update endpoint only allows editing description/source for
# those. `amount`/`currency` are checked separately below (model.amount is the
# converted BRL value, not directly comparable to the entered `payload.amount`).
_CREDIT_IMMUTABLE_FIELDS = ("date", "type", "payment_method")

# A Cofre recorte mirrors its amount/date into vault_transactions at creation time
# (see vault_service) - it is never recalculated from the expense, so editing these
# fields here would silently desync the two. `source` is locked too (unlike a CREDITO
# expense's freely-editable source): it's the exact "Investimento" label the vault icon
# on Entradas/Saídas keys off of. Only the description is left free to personalize.
_VAULT_IMMUTABLE_FIELDS = ("date", "type", "payment_method", "source")


def _resolve_currency(data: dict) -> dict:
    """See entry_service._resolve_currency - same conversion, applied to expenses."""
    original_amount = data["amount"]
    amount_brl, rate, rate_date = exchange_rate_service.convert_to_brl(
        original_amount, data["currency"], data["date"]
    )
    data["original_amount"] = original_amount
    data["amount"] = amount_brl
    data["exchange_rate"] = rate
    data["exchange_rate_date"] = rate_date
    return data


def list_expenses(db: Session, user_id: int) -> list[Expense]:
    return expense_repository.list_all(db, user_id)


def get_expense(db: Session, user_id: int, expense_id: int) -> Expense:
    expense = expense_repository.get(db, user_id, expense_id)
    if expense is None:
        raise NotFoundError("Saída não encontrada.")
    return expense


def _will_be_fixed_planned(type_: RecurrenceType, is_planned: bool) -> bool:
    return type_ == RecurrenceType.FIXED and is_planned


def create_expense(db: Session, user_id: int, payload: ExpenseCreate) -> Expense:
    if payload.source == VAULT_SOURCE_LABEL:
        raise ValidationAppError(
            f'A fonte "{VAULT_SOURCE_LABEL}" é reservada para movimentações do Cofre.'
        )
    data = _resolve_currency(payload.model_dump(exclude={"installments_count"}))
    # See entry_service.create_entry - same is_planned_since anchor for a FIXED rule's
    # monthly review backlog.
    if _will_be_fixed_planned(data["type"], data["is_planned"]):
        data["is_planned_since"] = date.today()
    expense = Expense(user_id=user_id, **data)

    if payload.payment_method == PaymentMethod.CREDITO:
        plan = build_installment_plan(payload.date, data["amount"], payload.installments_count)
        expense.installments = [
            Installment(
                installment_number=item.installment_number,
                total_installments=item.total_installments,
                due_date=item.due_date,
                base_amount=item.base_amount,
            )
            for item in plan
        ]

    return expense_repository.create(db, expense)


def update_expense(db: Session, user_id: int, expense_id: int, payload: ExpenseUpdate) -> Expense:
    expense = get_expense(db, user_id, expense_id)
    vault_transaction = vault_repository.get_by_expense_id(db, expense_id)

    if expense.payment_method == PaymentMethod.CREDITO:
        new_values = payload.model_dump()
        locked_changed = any(new_values[field] != getattr(expense, field) for field in _CREDIT_IMMUTABLE_FIELDS)
        amount_changed = new_values["amount"] != expense.original_amount
        currency_changed = new_values["currency"] != expense.currency
        if locked_changed or amount_changed or currency_changed:
            raise ValidationAppError(
                "Data, valor, moeda, tipo e meio de pagamento de uma compra parcelada não "
                "podem ser alterados após a criação. Exclua e recrie a compra, ou "
                "use ajustes de parcela para mudanças pontuais."
            )
        expense.description = payload.description
        expense.source = payload.source
    elif vault_transaction is not None:
        new_values = payload.model_dump()
        locked_changed = any(new_values[field] != getattr(expense, field) for field in _VAULT_IMMUTABLE_FIELDS)
        amount_changed = new_values["amount"] != expense.original_amount
        currency_changed = new_values["currency"] != expense.currency
        if locked_changed or amount_changed or currency_changed:
            raise ValidationAppError(
                "Apenas a descrição de um recorte gerado pelo Cofre pode ser alterada por "
                "aqui. Para desfazer, exclua a movimentação na tela do Cofre."
            )
        expense.description = payload.description
        # vault_transactions.description is a snapshot, not a live join - keep it in
        # sync or the Cofre screen would keep showing the old description.
        vault_transaction.description = payload.description
    else:
        if payload.source == VAULT_SOURCE_LABEL:
            raise ValidationAppError(
                f'A fonte "{VAULT_SOURCE_LABEL}" é reservada para movimentações do Cofre.'
            )
        data = _resolve_currency(payload.model_dump())
        was_fixed_planned = _will_be_fixed_planned(expense.type, expense.is_planned)
        will_be_fixed_planned = _will_be_fixed_planned(data["type"], data["is_planned"])
        if will_be_fixed_planned and not was_fixed_planned:
            data["is_planned_since"] = date.today()
        elif was_fixed_planned and not will_be_fixed_planned:
            data["is_planned_since"] = None
        for field, value in data.items():
            setattr(expense, field, value)

    db.commit()
    db.refresh(expense)
    return expense


def delete_expense(db: Session, user_id: int, expense_id: int) -> None:
    expense = get_expense(db, user_id, expense_id)
    expense_repository.delete(db, expense)


def _validate_fixed_planned_occurrence(expense: Expense, year: int, month: int) -> None:
    if not _will_be_fixed_planned(expense.type, expense.is_planned):
        raise ValidationAppError("Esta saída não é uma Fixa Planejada.")
    if expense.is_planned_since is None:
        raise ValidationAppError("Esta saída não possui um período de revisão definido.")

    target_idx = month_index(year, month)
    review_start_idx = max(
        month_index(expense.is_planned_since.year, expense.is_planned_since.month),
        month_index(expense.start_date.year, expense.start_date.month),
    )
    if target_idx < review_start_idx:
        raise ValidationAppError("Esse mês é anterior ao início da revisão desta saída.")
    if expense.end_date is not None and target_idx > month_index(expense.end_date.year, expense.end_date.month):
        raise ValidationAppError("Esse mês está fora do período ativo desta saída.")


def confirm_expense_occurrence(
    db: Session, user_id: int, expense_id: int, year: int, month: int, amount: Decimal | None
):
    expense = get_expense(db, user_id, expense_id)
    _validate_fixed_planned_occurrence(expense, year, month)
    return expense_occurrence_review_repository.upsert(
        db, expense.id, year, month, OccurrenceReviewStatus.CONFIRMED, amount
    )


def reject_expense_occurrence(db: Session, user_id: int, expense_id: int, year: int, month: int):
    expense = get_expense(db, user_id, expense_id)
    _validate_fixed_planned_occurrence(expense, year, month)
    return expense_occurrence_review_repository.upsert(
        db, expense.id, year, month, OccurrenceReviewStatus.REJECTED, None
    )
