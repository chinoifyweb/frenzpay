import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class WalletResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    currency: str
    balance: Decimal
    available_balance: Decimal
    held_balance: Decimal
    status: str


class VirtualAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_number: str | None
    routing_number: str | None
    iban: str | None
    bank_name: str | None
    account_name: str | None
    provider: str


class SendRequest(BaseModel):
    source_wallet_id: uuid.UUID
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(..., min_length=3, max_length=3)
    beneficiary_id: uuid.UUID
    otp: str | None = None  # Required for amounts > $500
    idempotency_key: str = Field(..., min_length=1)
    note: str | None = None


class FXQuoteRequest(BaseModel):
    from_currency: str = Field(..., min_length=3, max_length=3)
    to_currency: str = Field(..., min_length=3, max_length=3)
    amount: Decimal = Field(..., gt=0)


class FXQuoteResponse(BaseModel):
    quote_id: str
    from_currency: str
    to_currency: str
    source_amount: Decimal
    destination_amount: Decimal
    exchange_rate: Decimal
    frenzpay_rate: Decimal
    frenzpay_fee: Decimal
    expires_at: datetime


class ConvertRequest(BaseModel):
    quote_id: str
    otp: str | None = None


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reference: str
    type: str
    status: str
    source_amount: Decimal
    source_currency: str
    destination_amount: Decimal
    destination_currency: str
    exchange_rate: Decimal
    frenzpay_fee: Decimal
    initiated_at: datetime
    completed_at: datetime | None


class BeneficiaryCreate(BaseModel):
    nickname: str | None = None
    type: str
    country: str = Field(..., min_length=2, max_length=2)
    currency: str = Field(..., min_length=3, max_length=3)
    account_number: str | None = None
    account_name: str | None = None
    bank_name: str | None = None
    bank_code: str | None = None
    mobile_money_provider: str | None = None
    stablecoin_network: str | None = None
    stablecoin_address: str | None = None


class BeneficiaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nickname: str | None
    type: str
    country: str
    currency: str
    account_name: str | None
    bank_name: str | None
    mobile_money_provider: str | None
    stablecoin_network: str | None
    is_favorite: bool
    verified: bool
