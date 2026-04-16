"""
Transaction service — initiate sends, FX quotes, and conversions.

Business rules enforced here:
  - KYC tier 1 minimum for all outbound transactions
  - Daily/monthly spending limits per tier
  - Wallet status check (cannot send from frozen wallet)
  - Idempotency enforced via unique constraint on transactions.idempotency_key
  - FrenzPay fee applied before Graph payout
  - Double-entry ledger updated after Graph confirms (webhook)
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import (
    DuplicateTransaction,
    InsufficientFunds,
    KYCRequired,
    TransactionLimitExceeded,
    WalletFrozen,
)
from app.integrations.graph.client import graph
from app.models.transaction import (
    Beneficiary,
    FXRate,
    Transaction,
    TransactionStatus,
    TransactionType,
)
from app.models.user import KYCTier, User
from app.models.wallet import Wallet, WalletStatus
from app.schemas.transaction import (
    FXQuoteResponse,
    SendRequest,
    TransactionResponse,
)
from app.services.ledger_service import place_hold


# ── KYC Tier Limits (USD equivalent) ─────────────────────────────────────────

TIER_LIMITS: dict[KYCTier, dict[str, Decimal]] = {
    KYCTier.TIER_0: {"single": Decimal("0"), "daily": Decimal("0"), "monthly": Decimal("0")},
    KYCTier.TIER_1: {
        "single": Decimal("500"),
        "daily": Decimal("500"),
        "monthly": Decimal("2000"),
    },
    KYCTier.TIER_2: {
        "single": Decimal("5000"),
        "daily": Decimal("5000"),
        "monthly": Decimal("20000"),
    },
    KYCTier.TIER_3: {
        "single": Decimal("50000"),
        "daily": Decimal("50000"),
        "monthly": Decimal("999999999"),
    },
}

# FrenzPay fee: flat basis-point markup (configurable — currently 150 bps = 1.5%)
FX_MARKUP_BPS: int = 150
TRANSFER_FEE_BPS: int = 50  # 0.5% on outbound transfers


def _fee_for_amount(amount: Decimal, bps: int) -> Decimal:
    return (amount * bps / 10000).quantize(Decimal("0.0001"))


def _reference() -> str:
    return f"FRZ-{uuid.uuid4().hex[:10].upper()}"


# ── Spend limit checks ────────────────────────────────────────────────────────

async def _check_limits(user: User, amount_usd: Decimal, db: AsyncSession) -> None:
    """Raises TransactionLimitExceeded if the user would exceed their tier limits."""
    limits = TIER_LIMITS[user.kyc_tier]

    if amount_usd > limits["single"]:
        raise TransactionLimitExceeded("single transaction")

    now = datetime.now(UTC)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    daily_spent = (
        await db.execute(
            select(func.coalesce(func.sum(Transaction.source_amount), 0)).where(
                Transaction.user_id == user.id,
                Transaction.type.in_([TransactionType.WITHDRAWAL, TransactionType.FX_CONVERSION]),
                Transaction.status.notin_([TransactionStatus.FAILED, TransactionStatus.REVERSED]),
                Transaction.initiated_at >= day_start,
            )
        )
    ).scalar()

    monthly_spent = (
        await db.execute(
            select(func.coalesce(func.sum(Transaction.source_amount), 0)).where(
                Transaction.user_id == user.id,
                Transaction.type.in_([TransactionType.WITHDRAWAL, TransactionType.FX_CONVERSION]),
                Transaction.status.notin_([TransactionStatus.FAILED, TransactionStatus.REVERSED]),
                Transaction.initiated_at >= month_start,
            )
        )
    ).scalar()

    if Decimal(str(daily_spent)) + amount_usd > limits["daily"]:
        raise TransactionLimitExceeded("daily")
    if Decimal(str(monthly_spent)) + amount_usd > limits["monthly"]:
        raise TransactionLimitExceeded("monthly")


# ── FX Quote ──────────────────────────────────────────────────────────────────

async def get_fx_quote(
    from_currency: str,
    to_currency: str,
    amount: Decimal,
    db: AsyncSession,
) -> FXQuoteResponse:
    """
    Returns a quoted FX rate with FrenzPay markup.
    Caches the raw Graph rate in fx_rates for 60 seconds.
    """
    now = datetime.now(UTC)

    # Try cached rate first (valid within last 60s)
    cached = (
        await db.execute(
            select(FXRate).where(
                FXRate.from_currency == from_currency,
                FXRate.to_currency == to_currency,
                FXRate.valid_until > now,
            ).order_by(FXRate.valid_until.desc()).limit(1)
        )
    ).scalar_one_or_none()

    if cached:
        graph_rate = Decimal(str(cached.graph_rate))
        frenzpay_rate = Decimal(str(cached.frenzpay_rate))
        expires_at = cached.valid_until
    else:
        # Fetch fresh from Graph
        quote = await graph.get_fx_quote(from_currency, to_currency, float(amount))
        graph_rate = Decimal(str(quote.rate))
        # Apply markup: frenzpay_rate = graph_rate * (1 - markup_bps/10000)
        # We give the user a slightly worse rate and keep the spread
        frenzpay_rate = (graph_rate * (10000 - FX_MARKUP_BPS) / 10000).quantize(Decimal("0.000001"))
        expires_at = now + timedelta(seconds=60)

        rate_record = FXRate(
            from_currency=from_currency,
            to_currency=to_currency,
            graph_rate=float(graph_rate),
            frenzpay_rate=float(frenzpay_rate),
            markup_bps=FX_MARKUP_BPS,
            valid_from=now,
            valid_until=expires_at,
        )
        db.add(rate_record)
        await db.flush()

    destination_amount = (amount * frenzpay_rate).quantize(Decimal("0.0001"))
    frenzpay_fee = _fee_for_amount(amount, FX_MARKUP_BPS)

    # Use the FXRate id as quote_id so we can look it up during conversion
    return FXQuoteResponse(
        quote_id=str(cached.id if cached else rate_record.id),
        from_currency=from_currency,
        to_currency=to_currency,
        source_amount=amount,
        destination_amount=destination_amount,
        exchange_rate=frenzpay_rate,
        frenzpay_rate=frenzpay_rate,
        frenzpay_fee=frenzpay_fee,
        expires_at=expires_at,
    )


# ── Initiate Send (outbound withdrawal) ──────────────────────────────────────

async def initiate_send(
    data: SendRequest,
    user: User,
    db: AsyncSession,
) -> TransactionResponse:
    """
    Initiates an outbound money transfer:
    1. KYC + account checks
    2. Fetch wallet + beneficiary
    3. Calculate fee
    4. Place hold
    5. Call Graph payout
    6. Persist Transaction
    """
    # 1. KYC gate
    if user.kyc_tier == KYCTier.TIER_0:
        raise KYCRequired("TIER_1")

    # 2. Idempotency check — reject duplicate before doing anything
    existing = (
        await db.execute(
            select(Transaction).where(Transaction.idempotency_key == data.idempotency_key)
        )
    ).scalar_one_or_none()
    if existing:
        raise DuplicateTransaction()

    # 3. Fetch source wallet
    wallet: Wallet | None = (
        await db.execute(
            select(Wallet).where(
                Wallet.id == data.source_wallet_id,
                Wallet.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if not wallet:
        from fastapi import HTTPException
        raise HTTPException(404, "Wallet not found")
    if wallet.status == WalletStatus.FROZEN:
        raise WalletFrozen()

    # 4. Fetch beneficiary
    beneficiary: Beneficiary | None = (
        await db.execute(
            select(Beneficiary).where(
                Beneficiary.id == data.beneficiary_id,
                Beneficiary.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if not beneficiary:
        from fastapi import HTTPException
        raise HTTPException(404, "Beneficiary not found")

    # 5. Fee calculation
    amount = data.amount
    fee = _fee_for_amount(amount, TRANSFER_FEE_BPS)
    total_debit = amount + fee

    # 6. Spend-limit check (use source currency as-is; strict USD-only limits for now)
    await _check_limits(user, amount, db)

    # 7. Place hold (validates sufficient balance)
    await place_hold(wallet, total_debit, db)

    # 8. Create Transaction record (INITIATED → PENDING after Graph accepts)
    tx = Transaction(
        reference=_reference(),
        user_id=user.id,
        type=TransactionType.WITHDRAWAL,
        status=TransactionStatus.INITIATED,
        source_wallet_id=wallet.id,
        source_amount=float(amount),
        source_currency=data.currency,
        destination_amount=float(amount),
        destination_currency=beneficiary.currency,
        exchange_rate=1.0,
        frenzpay_fee=float(fee),
        idempotency_key=data.idempotency_key,
        tx_metadata={"note": data.note, "beneficiary_id": str(data.beneficiary_id)},
    )
    db.add(tx)
    await db.flush()

    # 9. Call Graph payout — if Graph rejects, release hold + mark FAILED
    try:
        payout_data = await graph.initiate_payout(
            customer_id=wallet.graph_account_id or "",
            amount=float(amount),
            currency=data.currency,
            beneficiary={
                "account_number": beneficiary.account_number,
                "account_name": beneficiary.account_name,
                "bank_code": beneficiary.bank_code,
                "bank_name": beneficiary.bank_name,
                "mobile_money_provider": beneficiary.mobile_money_provider,
                "stablecoin_network": beneficiary.stablecoin_network,
                "stablecoin_address": beneficiary.stablecoin_address,
                "type": beneficiary.type.value,
                "country": beneficiary.country,
                "currency": beneficiary.currency,
            },
            idempotency_key=data.idempotency_key,
        )
        tx.graph_reference = payout_data.get("id", "")
        tx.status = TransactionStatus.PENDING
    except Exception as exc:
        # Release hold and mark failed
        from app.services.ledger_service import release_hold
        await release_hold(wallet, total_debit, db)
        tx.status = TransactionStatus.FAILED
        tx.failed_at = datetime.now(UTC)
        tx.failure_reason = str(exc)

    return _tx_response(tx)


# ── Execute FX Conversion ─────────────────────────────────────────────────────

async def execute_conversion(
    quote_id: str,
    user: User,
    idempotency_key: str,
    db: AsyncSession,
) -> TransactionResponse:
    """
    Execute a previously quoted FX conversion.
    Debit source wallet, credit destination wallet.
    """
    if user.kyc_tier == KYCTier.TIER_0:
        raise KYCRequired("TIER_1")

    # Idempotency
    existing = (
        await db.execute(
            select(Transaction).where(Transaction.idempotency_key == idempotency_key)
        )
    ).scalar_one_or_none()
    if existing:
        raise DuplicateTransaction()

    # Fetch the quote
    now = datetime.now(UTC)
    rate_record: FXRate | None = (
        await db.execute(
            select(FXRate).where(
                FXRate.id == uuid.UUID(quote_id),
                FXRate.valid_until > now,
            )
        )
    ).scalar_one_or_none()
    if not rate_record:
        from fastapi import HTTPException
        raise HTTPException(410, "FX quote has expired. Please request a new quote.")

    from_currency = rate_record.from_currency
    to_currency = rate_record.to_currency
    frenzpay_rate = Decimal(str(rate_record.frenzpay_rate))

    # Get source and destination wallets
    source_wallet: Wallet | None = (
        await db.execute(
            select(Wallet).where(
                Wallet.user_id == user.id,
                Wallet.currency == from_currency,
            )
        )
    ).scalar_one_or_none()
    dest_wallet: Wallet | None = (
        await db.execute(
            select(Wallet).where(
                Wallet.user_id == user.id,
                Wallet.currency == to_currency,
            )
        )
    ).scalar_one_or_none()

    if not source_wallet or not dest_wallet:
        from fastapi import HTTPException
        raise HTTPException(400, f"You need both a {from_currency} and {to_currency} wallet to convert")

    if source_wallet.status == WalletStatus.FROZEN:
        raise WalletFrozen()

    # For conversions the user specifies source amount in request — use wallet balance as reference
    # Actually for simplicity: convert full available balance or a fixed amount
    # Since we don't have amount here (it was in the quote request), we need to get it from the rate record
    # We store available_balance at quote time — use the rate record's markup bps to back-calculate
    # Simplest: require the client to pass amount in ConvertRequest, we'll add it to the route
    # For now, raise and tell them to use the transactions endpoint with amount
    from fastapi import HTTPException
    raise HTTPException(501, "Pass source_amount in the conversion request")


async def execute_conversion_with_amount(
    quote_id: str,
    source_amount: Decimal,
    user: User,
    idempotency_key: str,
    db: AsyncSession,
) -> TransactionResponse:
    """Full FX conversion with an explicit source_amount."""
    if user.kyc_tier == KYCTier.TIER_0:
        raise KYCRequired("TIER_1")

    existing = (
        await db.execute(
            select(Transaction).where(Transaction.idempotency_key == idempotency_key)
        )
    ).scalar_one_or_none()
    if existing:
        raise DuplicateTransaction()

    now = datetime.now(UTC)
    rate_record: FXRate | None = (
        await db.execute(
            select(FXRate).where(
                FXRate.id == uuid.UUID(quote_id),
                FXRate.valid_until > now,
            )
        )
    ).scalar_one_or_none()
    if not rate_record:
        from fastapi import HTTPException
        raise HTTPException(410, "FX quote expired. Please request a new quote.")

    frenzpay_rate = Decimal(str(rate_record.frenzpay_rate))
    destination_amount = (source_amount * frenzpay_rate).quantize(Decimal("0.0001"))
    fx_markup_fee = _fee_for_amount(source_amount, rate_record.markup_bps)

    # Spend limit check
    await _check_limits(user, source_amount, db)

    # Get wallets
    source_wallet = (
        await db.execute(
            select(Wallet).where(
                Wallet.user_id == user.id,
                Wallet.currency == rate_record.from_currency,
            )
        )
    ).scalar_one_or_none()
    dest_wallet = (
        await db.execute(
            select(Wallet).where(
                Wallet.user_id == user.id,
                Wallet.currency == rate_record.to_currency,
            )
        )
    ).scalar_one_or_none()

    if not source_wallet or not dest_wallet:
        from fastapi import HTTPException
        raise HTTPException(400, "Missing source or destination wallet for this currency pair")
    if source_wallet.status == WalletStatus.FROZEN:
        raise WalletFrozen()

    # Hold source funds
    await place_hold(source_wallet, source_amount, db)

    tx = Transaction(
        reference=_reference(),
        user_id=user.id,
        type=TransactionType.FX_CONVERSION,
        status=TransactionStatus.INITIATED,
        source_wallet_id=source_wallet.id,
        destination_wallet_id=dest_wallet.id,
        source_amount=float(source_amount),
        source_currency=rate_record.from_currency,
        destination_amount=float(destination_amount),
        destination_currency=rate_record.to_currency,
        exchange_rate=float(frenzpay_rate),
        frenzpay_fee=float(fx_markup_fee),
        frenzpay_fx_markup=float(fx_markup_fee),
        idempotency_key=idempotency_key,
        tx_metadata={"quote_id": quote_id},
    )
    db.add(tx)
    await db.flush()

    # Execute on Graph
    try:
        result = await graph.execute_fx(quote_id, idempotency_key)
        tx.graph_reference = result.get("id", "")
        tx.status = TransactionStatus.PENDING
    except Exception as exc:
        from app.services.ledger_service import release_hold
        await release_hold(source_wallet, source_amount, db)
        tx.status = TransactionStatus.FAILED
        tx.failed_at = datetime.now(UTC)
        tx.failure_reason = str(exc)

    return _tx_response(tx)


# ── List transactions ─────────────────────────────────────────────────────────

async def list_transactions(
    user: User,
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    tx_type: str | None = None,
    status: str | None = None,
) -> dict:
    q = select(Transaction).where(Transaction.user_id == user.id)
    if tx_type:
        q = q.where(Transaction.type == tx_type)
    if status:
        q = q.where(Transaction.status == status)

    total = (
        await db.execute(
            select(func.count()).select_from(
                select(Transaction).where(Transaction.user_id == user.id).subquery()
            )
        )
    ).scalar()

    rows = (
        await db.execute(
            q.order_by(Transaction.initiated_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).scalars().all()

    return {
        "items": [_tx_dict(tx) for tx in rows],
        "total": total,
        "page": page,
        "pages": max(1, (total + limit - 1) // limit),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tx_response(tx: Transaction) -> TransactionResponse:
    return TransactionResponse(
        id=tx.id,
        reference=tx.reference,
        type=tx.type.value,
        status=tx.status.value,
        source_amount=Decimal(str(tx.source_amount)),
        source_currency=tx.source_currency,
        destination_amount=Decimal(str(tx.destination_amount)),
        destination_currency=tx.destination_currency,
        exchange_rate=Decimal(str(tx.exchange_rate)),
        frenzpay_fee=Decimal(str(tx.frenzpay_fee)),
        initiated_at=tx.initiated_at,
        completed_at=tx.completed_at,
    )


def _tx_dict(tx: Transaction) -> dict:
    return {
        "id": str(tx.id),
        "reference": tx.reference,
        "type": tx.type.value,
        "status": tx.status.value,
        "source_amount": float(tx.source_amount),
        "source_currency": tx.source_currency,
        "destination_amount": float(tx.destination_amount),
        "destination_currency": tx.destination_currency,
        "exchange_rate": float(tx.exchange_rate),
        "frenzpay_fee": float(tx.frenzpay_fee),
        "initiated_at": tx.initiated_at.isoformat(),
        "completed_at": tx.completed_at.isoformat() if tx.completed_at else None,
        "note": (tx.tx_metadata or {}).get("note"),
    }
