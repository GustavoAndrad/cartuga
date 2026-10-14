from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.assistant import audit
from app.auth.dependencies import require_admin
from app.database.session import get_db
from app.models.user import User
from app.schemas.assistant import AssistantLogDetailOut, AssistantLogPageOut

# Administrators only - and each one sees only their OWN records: the logs hold the
# questions and the financial data the assistant consulted (assistant/audit.py).
router = APIRouter(prefix="/admin/assistant", tags=["assistant-admin"])


@router.get("/logs", response_model=AssistantLogPageOut)
def list_logs(
    status: str | None = Query(None, pattern="^(ok|error)$"),
    kind: str | None = Query(None, pattern="^(chat|connection_test)$"),
    search: str | None = Query(None, max_length=200),
    limit: int = Query(50, ge=1, le=audit.MAX_LIST_LIMIT),
    offset: int = Query(0, ge=0),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return audit.list_logs(db, admin.id, status=status, kind=kind, search=search, limit=limit, offset=offset)


@router.get("/logs/{log_id}", response_model=AssistantLogDetailOut)
def get_log(log_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return audit.get_log(db, admin.id, log_id)


@router.delete("/logs", status_code=204)
def delete_logs(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    audit.delete_all(db, admin.id)
