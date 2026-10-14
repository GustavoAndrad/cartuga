from sqlalchemy.orm import Session, joinedload

from app.models.enums import VaultTransactionType
from app.models.vault_transaction import VaultTransaction

_WITH_RELATED = (
    joinedload(VaultTransaction.entry),
    joinedload(VaultTransaction.expense),
    joinedload(VaultTransaction.source_entry),
)


def list_all(db: Session, user_id: int) -> list[VaultTransaction]:
    return (
        db.query(VaultTransaction)
        .filter(VaultTransaction.user_id == user_id)
        .options(*_WITH_RELATED)
        .order_by(VaultTransaction.date.desc(), VaultTransaction.id.desc())
        .all()
    )


def get(db: Session, user_id: int, transaction_id: int) -> VaultTransaction | None:
    return (
        db.query(VaultTransaction)
        .filter(VaultTransaction.id == transaction_id, VaultTransaction.user_id == user_id)
        .options(*_WITH_RELATED)
        .first()
    )


def list_carves_for_entry(db: Session, entry_id: int) -> list[VaultTransaction]:
    """Every DEPOSIT_CARVE already taken from `entry_id` - used to enforce the
    cumulative 100% cap across multiple carves of the same entry."""
    return (
        db.query(VaultTransaction)
        .filter(
            VaultTransaction.source_entry_id == entry_id,
            VaultTransaction.type == VaultTransactionType.DEPOSIT_CARVE,
        )
        .all()
    )


def get_by_entry_id(db: Session, entry_id: int) -> VaultTransaction | None:
    """The DEPOSIT_FRESH/WITHDRAWAL transaction that generated `entry_id`, if any -
    used by entry_service to lock editing of vault-generated entries."""
    return db.query(VaultTransaction).filter(VaultTransaction.entry_id == entry_id).first()


def get_by_expense_id(db: Session, expense_id: int) -> VaultTransaction | None:
    """The DEPOSIT_CARVE transaction that generated `expense_id`, if any - used by
    expense_service to lock editing of vault-generated expenses."""
    return db.query(VaultTransaction).filter(VaultTransaction.expense_id == expense_id).first()


def create(db: Session, transaction: VaultTransaction) -> VaultTransaction:
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction
