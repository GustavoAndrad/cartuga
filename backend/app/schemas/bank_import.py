from datetime import date as _date
from decimal import Decimal
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import PaymentMethod
from app.schemas.common import Description, Source


class BankName(str, Enum):
    INTER = "INTER"
    NUBANK = "NUBANK"


class ImportKind(str, Enum):
    ENTRADA = "ENTRADA"
    SAIDA = "SAIDA"
    GUARDAR = "GUARDAR"
    RETIRAR = "RETIRAR"


class ImportRow(BaseModel):
    """One bank-statement line translated into a would-be Cartuga record - the shape
    covers all four `kind`s at once (unused fields for a given kind are just ignored),
    since the user can freely reclassify a row in the review screen before commit.
    Nothing here is written to the database yet; see bank_import_service.commit_rows."""

    kind: ImportKind
    # Aliased import (see module top) - a field named `date` typed as the bare `date`
    # class self-shadows in pydantic's annotation resolution (the class-body attribute
    # `date = None` gets evaluated before the annotation, so `date | None` becomes
    # `None | None`). Aliasing the import sidesteps it while keeping the JSON key "date".
    date: _date | None = None
    amount: Decimal | None = None
    description: Description = ""
    # ENTRADA/SAIDA only - VaultTransactionCreate has no source field.
    source: Source = ""
    # SAIDA only.
    payment_method: PaymentMethod | None = None
    warnings: list[str] = Field(default_factory=list)
    # Original CSV columns for this line, kept for the review screen's benefit.
    raw: dict[str, str] = Field(default_factory=dict)


class BankImportPreviewOut(BaseModel):
    rows: list[ImportRow]
    file_warnings: list[str] = Field(default_factory=list)


class ImportCommitIn(BaseModel):
    rows: list[ImportRow]


class ImportRowResult(BaseModel):
    index: int
    status: Literal["created", "error"]
    message: str | None = None
    entry_id: int | None = None
    expense_id: int | None = None
    vault_transaction_id: int | None = None


class ImportCommitOut(BaseModel):
    created: int
    failed: int
    results: list[ImportRowResult]
