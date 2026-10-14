from pydantic import BaseModel


class ImportIssueOut(BaseModel):
    sheet: str
    row: int | None
    message: str


class ImportPreviewOut(BaseModel):
    valid: bool
    errors: list[ImportIssueOut]
    warnings: list[ImportIssueOut]
    counts: dict[str, int]


class ImportConfirmOut(BaseModel):
    counts: dict[str, int]
    temporary_passwords: dict[str, str]


class RestoreBackupOut(BaseModel):
    restored_from: str
