import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    kyc_tier: str
    kyc_status: str
    account_status: str
    country: str
    referral_code: str
    two_factor_enabled: bool
    created_at: datetime


class ProfileUpdateRequest(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    date_of_birth: datetime | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
