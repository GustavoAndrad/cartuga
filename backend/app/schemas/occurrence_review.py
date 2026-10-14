from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.enums import OccurrenceReviewStatus


class OccurrenceConfirmIn(BaseModel):
    # None = confirm exactly as estimated (the rule's own amount). Set = this month's
    # real value differed - overrides just this occurrence, the rule and every other
    # month are untouched.
    amount: Decimal | None = None

    @field_validator("amount")
    @classmethod
    def amount_must_be_positive(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v <= 0:
            raise ValueError("O valor deve ser maior que zero.")
        return v


class OccurrenceReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    year: int
    month: int
    status: OccurrenceReviewStatus
    override_amount: Decimal | None
    created_at: datetime
    updated_at: datetime
