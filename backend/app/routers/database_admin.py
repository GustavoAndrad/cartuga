from fastapi import APIRouter, Depends, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.database.session import get_db, get_engine
from app.schemas.database_admin import ImportConfirmOut, ImportPreviewOut, RestoreBackupOut
from app.services import backup_service, export_service
from app.services.import_service import ImportFileError, execute_import, validate_workbook
from app.utils.errors import NotFoundError

router = APIRouter(prefix="/database", tags=["database"])

MAX_IMPORT_SIZE_BYTES = 20 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",  # some clients don't set a specific xlsx MIME type
}


async def _read_and_check_upload(file: UploadFile) -> bytes:
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise ImportFileError("O arquivo deve ter extensão .xlsx.")
    if file.content_type and file.content_type not in ALLOWED_CONTENT_TYPES:
        raise ImportFileError(f"Tipo de arquivo não suportado: {file.content_type}.")

    content = await file.read()
    if len(content) == 0:
        raise ImportFileError("O arquivo está vazio.")
    if len(content) > MAX_IMPORT_SIZE_BYTES:
        raise ImportFileError("O arquivo excede o tamanho máximo permitido (20MB).")

    return content


@router.get("/export", dependencies=[Depends(require_admin)])
def export_database(db: Session = Depends(get_db)):
    buffer = export_service.build_export_workbook(db)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="cartuga-export.xlsx"'},
    )


@router.post("/import", dependencies=[Depends(require_admin)])
async def import_database(
    file: UploadFile,
    dry_run: bool = Query(False),
    confirm: bool = Query(False),
    engine: Engine = Depends(get_engine),
):
    """Two-step flow (spec section 25): call with `dry_run=true` first to get a
    validation preview with no DB writes; only after that comes back `valid: true`,
    call again with `confirm=true` (the file is re-validated from scratch either way -
    never trust client state between calls) to actually back up and replace the data.
    Exactly one of dry_run/confirm must be set."""
    if dry_run == confirm:
        raise ImportFileError("Especifique exatamente um de dry_run=true ou confirm=true.")

    content = await _read_and_check_upload(file)
    # validate_workbook/create_backup/execute_import are all blocking (CPU-bound parsing,
    # a subprocess call, a synchronous DB transaction) - running them straight on the
    # event loop would stall every other request on this worker for as long as they take.
    preview, parsed = await run_in_threadpool(validate_workbook, content)

    if dry_run:
        return ImportPreviewOut(
            valid=preview.valid,
            errors=[e.to_dict() for e in preview.errors],
            warnings=[w.to_dict() for w in preview.warnings],
            counts=preview.counts,
        )

    if not preview.valid or parsed is None:
        raise ImportFileError(
            "O arquivo não passou na validação. Rode novamente com dry_run=true para ver os erros."
        )

    await run_in_threadpool(backup_service.create_backup)  # aborts before any data is touched if this fails
    result = await run_in_threadpool(execute_import, engine, parsed)

    return ImportConfirmOut(counts=result.counts, temporary_passwords=result.temporary_passwords)


@router.post("/restore-backup", response_model=RestoreBackupOut, dependencies=[Depends(require_admin)])
def restore_backup():
    latest = backup_service.get_latest_backup()
    if latest is None:
        raise NotFoundError("Nenhum backup disponível para restauração.")
    backup_service.restore_backup(latest)
    return RestoreBackupOut(restored_from=latest.name)
