import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class BVNVerifyRequest(BaseModel):
    bvn: str = Field(..., min_length=11, max_length=11, pattern=r"^\d{11}$")


class NINVerifyRequest(BaseModel):
    nin: str = Field(..., min_length=11, max_length=11, pattern=r"^\d{11}$")


class SelfieVerifyRequest(BaseModel):
    selfie_base64: str  # base64-encoded image
    liveness_token: str | None = None  # from Dojah SDK


class DocumentUploadRequest(BaseModel):
    document_type: str
    document_number: str | None = None
    document_base64: str


class KYCStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    kyc_tier: str
    kyc_status: str
    submissions: list["KYCSubmissionSummary"]


class KYCSubmissionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tier: str
    status: str
    submitted_at: datetime
    verified_at: datetime | None
    rejection_reason: str | None
