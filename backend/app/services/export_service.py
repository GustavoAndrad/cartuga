"""Full-database xlsx export (spec section 24). password_hash is never included -
see docs/decisions.md."""

from decimal import Decimal
from io import BytesIO

from openpyxl import Workbook
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.models.expense import Expense
from app.models.installment import Installment
from app.models.installment_adjustment import InstallmentAdjustment
from app.models.user import User

USERS_COLUMNS = ["id", "name", "email", "photo", "role", "created_at", "updated_at"]
ENTRIES_COLUMNS = [
    "id",
    "user_id",
    "date",
    "amount",
    "description",
    "source",
    "type",
    "start_date",
    "end_date",
    "created_at",
    "updated_at",
]
EXPENSES_COLUMNS = [
    "id",
    "user_id",
    "date",
    "amount",
    "description",
    "source",
    "type",
    "payment_method",
    "start_date",
    "end_date",
    "created_at",
    "updated_at",
]
INSTALLMENTS_COLUMNS = [
    "id",
    "expense_id",
    "installment_number",
    "total_installments",
    "due_date",
    "base_amount",
    "advanced_to_year",
    "advanced_to_month",
    "created_at",
    "updated_at",
]
ADJUSTMENTS_COLUMNS = [
    "id",
    "installment_id",
    "amount",
    "description",
    "created_at",
    "updated_at",
]


def _write_sheet(wb: Workbook, title: str, columns: list[str], rows: list, first: bool = False):
    ws = wb.active if first else wb.create_sheet()
    ws.title = title
    ws.append(columns)
    for row in rows:
        ws.append([_cell_value(getattr(row, col)) for col in columns])


def _cell_value(value):
    if hasattr(value, "value"):  # enum
        return value.value
    if isinstance(value, Decimal):
        # Written as exact text, never a float cell - avoids any binary-floating-point
        # round-trip risk for money on export/import (spec section 28: no FLOAT for
        # financial values, extended here to the interchange format too).
        return str(value)
    return value


def build_export_workbook(db: Session) -> BytesIO:
    wb = Workbook()

    _write_sheet(wb, "users", USERS_COLUMNS, db.query(User).order_by(User.id).all(), first=True)
    _write_sheet(wb, "entries", ENTRIES_COLUMNS, db.query(Entry).order_by(Entry.id).all())
    _write_sheet(wb, "expenses", EXPENSES_COLUMNS, db.query(Expense).order_by(Expense.id).all())
    _write_sheet(
        wb, "installments", INSTALLMENTS_COLUMNS, db.query(Installment).order_by(Installment.id).all()
    )
    _write_sheet(
        wb,
        "installment_adjustments",
        ADJUSTMENTS_COLUMNS,
        db.query(InstallmentAdjustment).order_by(InstallmentAdjustment.id).all(),
    )

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer
