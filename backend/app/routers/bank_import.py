from fastapi import APIRouter, Depends, Form, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.schemas.bank_import import BankImportPreviewOut, BankName, ImportCommitIn, ImportCommitOut
from app.services import bank_import_service
from app.services.bank_import_service import BankImportFileError

router = APIRouter(prefix="/bank-import", tags=["bank-import"])

MAX_IMPORT_SIZE_BYTES = 5 * 1024 * 1024


async def _read_and_check_upload(file: UploadFile) -> bytes:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise BankImportFileError("O arquivo deve ter extensão .csv.")

    content = await file.read()
    if len(content) == 0:
        raise BankImportFileError("O arquivo está vazio.")
    if len(content) > MAX_IMPORT_SIZE_BYTES:
        raise BankImportFileError("O arquivo excede o tamanho máximo permitido (5MB).")

    return content


@router.post("/preview", response_model=BankImportPreviewOut)
async def preview_bank_import(
    file: UploadFile,
    bank: BankName = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Parses the uploaded statement and classifies each line into a draft record -
    nothing is written yet. See bank_import_service module docstring."""
    content = await _read_and_check_upload(file)
    # CPU-bound CSV parsing - keep it off the event loop, same reasoning as the
    # database import endpoint.
    return await run_in_threadpool(bank_import_service.preview, db, current_user.id, bank, content)


@router.post("/commit", response_model=ImportCommitOut)
def commit_bank_import(
    payload: ImportCommitIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Commits the (possibly user-edited) rows from a prior preview. Best-effort, not
    all-or-nothing: each row goes through the normal create endpoints' own validation
    independently, so one bad row is reported and skipped rather than aborting the
    whole batch - see bank_import_service.commit_rows."""
    return bank_import_service.commit_rows(db, current_user.id, payload.rows)
