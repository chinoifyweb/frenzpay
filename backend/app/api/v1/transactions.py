"""
Transactions API — send money, FX quotes, conversions, transaction history.
All endpoints require at minimum KYC Tier 1.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import CurrentUser, get_db
from app.core.rate_limit import rate_limit
from app.schemas.transaction import (
    BeneficiaryCreate,
    BeneficiaryResponse,
    ConvertRequest,
    FXQuoteRequest,
    FXQuoteResponse,
    SendRequest,
    TransactionResponse,
)
from app.services import transaction_service

router = APIRouter(prefix="/transactions", tags=["transactions"])

# Rate limits
_send_limit = Depends(rate_limit(10, 60))  # 10 sends/min


# ── Transaction history ───────────────────────────────────────────────────────

@router.get("")
async def list_transactions(
    user: CurrentUser,
    db=Depends(get_db),
    page: int = 1,
    type: str = "",
    status: str = "",
):
    """List the authenticated user's transactions with pagination."""
    return await transaction_service.list_transactions(
        user=user,
        db=db,
        page=page,
        tx_type=type or None,
        status=status or None,
    )


@router.get("/{reference}", response_model=TransactionResponse)
async def get_transaction(reference: str, user: CurrentUser, db=Depends(get_db)):
    """Fetch a single transaction by reference."""
    from sqlalchemy import select
    from app.models.transaction import Transaction

    result = await db.execute(
        select(Transaction).where(
            Transaction.reference == reference,
            Transaction.user_id == user.id,
        )
    )
    tx = result.scalar_one_or_none()
    if not tx:
        raise HTTPException(404, "Transaction not found")
    return transaction_service._tx_response(tx)


# ── FX Quote ──────────────────────────────────────────────────────────────────

@router.post("/fx-quote", response_model=FXQuoteResponse)
async def get_fx_quote(
    data: FXQuoteRequest,
    user: CurrentUser,
    db=Depends(get_db),
):
    """
    Get a live FX quote with FrenzPay's spread applied.
    Quote is valid for 60 seconds — pass quote_id to /convert.
    """
    return await transaction_service.get_fx_quote(
        from_currency=data.from_currency.upper(),
        to_currency=data.to_currency.upper(),
        amount=data.amount,
        db=db,
    )


# ── Send / Withdraw ───────────────────────────────────────────────────────────

@router.post("/send", response_model=TransactionResponse, dependencies=[_send_limit])
async def send_money(
    data: SendRequest,
    user: CurrentUser,
    db=Depends(get_db),
):
    """
    Initiate an outbound payment to a saved beneficiary.
    Requires KYC Tier 1 and sufficient available balance (including fee).
    The transaction is PENDING until Graph confirms via webhook.
    """
    return await transaction_service.initiate_send(data=data, user=user, db=db)


# ── FX Conversion ─────────────────────────────────────────────────────────────

@router.post("/convert", response_model=TransactionResponse, dependencies=[_send_limit])
async def convert_currency(
    data: ConvertRequest,
    user: CurrentUser,
    db=Depends(get_db),
):
    """
    Execute an FX conversion using a previously obtained quote.
    source_amount must be provided and must match the amount used for the quote.
    """
    from decimal import Decimal
    from pydantic import BaseModel

    # ConvertRequest as defined has quote_id + optional otp.
    # We extend here: if source_amount is in the body use it.
    source_amount = getattr(data, "source_amount", None)
    if source_amount is None:
        raise HTTPException(400, "source_amount is required for conversions")

    idempotency_key = getattr(data, "idempotency_key", None) or str(uuid.uuid4())

    return await transaction_service.execute_conversion_with_amount(
        quote_id=data.quote_id,
        source_amount=Decimal(str(source_amount)),
        user=user,
        idempotency_key=idempotency_key,
        db=db,
    )
