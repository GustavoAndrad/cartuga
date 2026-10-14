from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.schemas.data_export import DataExportOptionsOut, DataExportPreviewOut, DataExportRequest
from app.services import data_export_service
from app.services import finance_engine as fe

# Any role - every dataset is scoped to the caller's own records.
router = APIRouter(prefix="/exports", tags=["exports"])


def _config(payload: DataExportRequest) -> data_export_service.ExportConfig:
    return data_export_service.ExportConfig(**payload.model_dump())


@router.get("/data/options", response_model=DataExportOptionsOut)
def get_data_export_options(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {
        "datasets": list(data_export_service.DATASETS.values()),
        "navigable_range": fe.get_navigable_range(db, current_user.id),
        "max_span_months": data_export_service.MAX_SPAN_MONTHS,
    }


@router.post("/data/preview", response_model=DataExportPreviewOut)
async def preview_data_export(
    payload: DataExportRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    # Month-by-month recalculation is blocking DB work - keep it off the event loop.
    datasets = await run_in_threadpool(data_export_service.build_preview, db, current_user.id, _config(payload))
    return {"datasets": datasets}


@router.post("/data")
async def export_data(
    payload: DataExportRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    content, filename, media_type = await run_in_threadpool(
        data_export_service.build_export, db, current_user.id, _config(payload)
    )
    return Response(
        content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
