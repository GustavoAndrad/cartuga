from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.dashboard import NavigableRangeOut


class DataExportRequest(BaseModel):
    from_year: int = Field(ge=1900, le=3000)
    from_month: int = Field(ge=1, le=12)
    to_year: int = Field(ge=1900, le=3000)
    to_month: int = Field(ge=1, le=12)
    datasets: list[str]
    format: Literal["excel_br", "standard"] = "excel_br"


class DatasetInfoOut(BaseModel):
    key: str
    label: str
    description: str
    filename: str
    columns: list[str]


class DataExportOptionsOut(BaseModel):
    datasets: list[DatasetInfoOut]
    navigable_range: NavigableRangeOut
    max_span_months: int


class DatasetPreviewOut(BaseModel):
    key: str
    label: str
    filename: str
    columns: list[str]
    rows: list[list[str]]
    total_rows: int


class DataExportPreviewOut(BaseModel):
    datasets: list[DatasetPreviewOut]
