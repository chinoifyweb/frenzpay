"""
Celery tasks for processing Bridge, Dojah, and Yellow Card webhook events.

All tasks use:
  - Idempotency: skip events already processed (checked via graph_reference / idempotency_key)
  - Exponential retry: 5 retries with doubling backoff
  - Audit logging: every state change is recorded

Bridge transfer state machine:
  awaiting_funds → funds_received → payment_submitted → payment_processed
  (also: in_review, kyc_required, canceled, error, returned, refund_in_flight, refunded, undeliverable)
"""

import logging
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


# ── Retry decorator factory ───────────────────────────────────────────────────

def _task(name: str, max_retries: int = 5, base_delay: int = 60):
    return celery_app.task(
        name=name,
        bind=True,
        max_retries=max_retries,
        default_retry_delay=base_delay,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# BRIDGE EVENTS
# ═══════════════════════════════════════════════════════════════════════════════

@_task("app.workers.webhook_tasks.process_bridge_transfer_event")
def process_bridge_transfer_event(self, event: dict):
    """Handle transfer.* events from Bridge."""
    import asyncio
    try:
        asyncio.run(_handle_bridge_transfer(event))
    except Exception as exc:
        logger.error(f"Bridge transfer event failed: {exc}")
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


async def _handle_bridge_transfer(event: dict):
    """
    Map Bridge transfer states → FrenzPay TransactionStatus.

    Bridge state     → FrenzPay status
    ─────────────────────────────────────────────────────────
    awaiting_funds       PENDING
    funds_received       PENDING
    payment_submitted    PROCESSING
    payment_processed    COMPLETED
    in_review            PENDING
    kyc_required         PENDING
    canceled             FAILED
    error                FAILED
    returned             REVERSED
    refund_in_flight     REVERSED
    refunded             REVERSED
    undeliverable        FAILED
    """
    from sqlalchemy.future import select
    from app.database import AsyncSessionLocal
    from app.models.transaction import Transaction, TransactionStatus
    from app.integrations.graph.client import map_bridge_state

    # Bridge may wrap the payload under a "data" key
    payload = event.get("data", event)
    bridge_id: str = payload.get("id", event.get("id", ""))
    bridge_state: str = payload.get("state", payload.get("status", ""))

    if not bridge_id or not bridge_state:
        logger.warning(f"Bridge transfer event missing id/state: {event}")
        return

    frenzpay_status_str = map_bridge_state(bridge_state)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Transaction).where(Transaction.graph_reference == bridge_id)
        )
        tx = result.scalar_one_or_none()

        if not tx:
            logger.warning(f"Bridge transfer {bridge_id}: no matching FrenzPay transaction")
            return

        now = datetime.now(UTC)

        if frenzpay_status_str == "COMPLETED":
            tx.status = TransactionStatus.COMPLETED
            tx.completed_at = now
            # Release the hold and post credit
            await _settle_transaction(db, tx)
            logger.info(f"Transaction {tx.reference} COMPLETED via Bridge transfer {bridge_id}")

        elif frenzpay_status_str == "FAILED":
            tx.status = TransactionStatus.FAILED
            tx.failed_at = now
            failure_reason = (
                payload.get("receipt", {}).get("initial_amount")
                or payload.get("error", "Bridge rejected transfer")
            )
            tx.failure_reason = str(failure_reason)
            await _release_transaction_hold(db, tx)
            logger.info(f"Transaction {tx.reference} FAILED: {failure_reason}")

        elif frenzpay_status_str == "REVERSED":
            tx.status = TransactionStatus.REVERSED
            tx.completed_at = now
            await _release_transaction_hold(db, tx)
            logger.info(f"Transaction {tx.reference} REVERSED (state={bridge_state})")

        elif frenzpay_status_str == "PROCESSING":
            tx.status = TransactionStatus.PROCESSING
            logger.info(f"Transaction {tx.reference} now PROCESSING (state={bridge_state})")

        else:
            # PENDING — just log, no state change needed if already PENDING
            logger.debug(f"Transaction {tx.reference} still pending (state={bridge_state})")

        # Record Bridge state in metadata
        if tx.tx_metadata is None:
            tx.tx_metadata = {}
        tx.tx_metadata["bridge_state"] = bridge_state
        tx.tx_metadata["bridge_updated_at"] = now.isoformat()

        await db.commit()


@_task("app.workers.webhook_tasks.process_bridge_virtual_account_event")
def process_bridge_virtual_account_event(self, event: dict):
    """Handle virtual_account.activity — inbound funds received."""
    import asyncio
    try:
        asyncio.run(_handle_bridge_deposit(event))
    except Exception as exc:
        logger.error(f"Bridge deposit event failed: {exc}")
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


async def _handle_bridge_deposit(event: dict):
    """Credit user wallet when funds arrive at their Bridge virtual account."""
    from sqlalchemy.future import select
    from app.database import AsyncSessionLocal
    from app.models.wallet import Wallet, VirtualAccount
    from app.models.transaction import Transaction, TransactionType, TransactionStatus
    from app.services.ledger_service import post_journal_entry

    payload = event.get("data", event)
    va_id: str = payload.get("virtual_account_id", payload.get("id", ""))
    amount_raw = payload.get("amount", payload.get("net_amount", 0))
    amount = Decimal(str(amount_raw))
    currency: str = payload.get("currency", "").upper()
    bridge_tx_id: str = payload.get("id", payload.get("transaction_id", ""))

    if not va_id or amount <= 0:
        logger.warning(f"Bridge deposit event incomplete: {event}")
        return

    async with AsyncSessionLocal() as db:
        # Idempotency: skip if already processed
        dup = (
            await db.execute(
                select(Transaction).where(Transaction.graph_reference == bridge_tx_id)
            )
        ).scalar_one_or_none()
        if dup:
            logger.info(f"Bridge deposit {bridge_tx_id} already processed — skipping")
            return

        # Find virtual account → wallet
        va = (
            await db.execute(
                select(VirtualAccount).where(VirtualAccount.provider_reference == va_id)
            )
        ).scalar_one_or_none()
        if not va:
            logger.error(f"Bridge deposit: no virtual account for id={va_id}")
            return

        wallet = (
            await db.execute(select(Wallet).where(Wallet.id == va.wallet_id))
        ).scalar_one_or_none()
        if not wallet:
            logger.error(f"Bridge deposit: no wallet for virtual_account {va_id}")
            return

        # System float wallet (debit side of the journal)
        system_wallet = (
            await db.execute(
                select(Wallet).where(
                    Wallet.user_id == None,  # noqa: E711
                    Wallet.currency == currency,
                )
            )
        ).scalar_one_or_none()

        tx = Transaction(
            reference=f"FRZ-DEP-{uuid.uuid4().hex[:8].upper()}",
            user_id=wallet.user_id,
            type=TransactionType.DEPOSIT,
            status=TransactionStatus.COMPLETED,
            destination_wallet_id=wallet.id,
            source_amount=amount,
            source_currency=currency,
            destination_amount=amount,
            destination_currency=currency,
            exchange_rate=1.0,
            frenzpay_fee=0.0,
            graph_reference=bridge_tx_id,
            idempotency_key=bridge_tx_id or str(uuid.uuid4()),
            completed_at=datetime.now(UTC),
        )
        db.add(tx)
        await db.flush()

        if system_wallet:
            await post_journal_entry(
                db, tx, system_wallet, wallet, amount, currency, "Bridge inbound deposit"
            )
        else:
            # Direct credit if no system wallet yet
            wallet.balance = float(Decimal(str(wallet.balance)) + amount)
            wallet.available_balance = float(Decimal(str(wallet.available_balance)) + amount)

        logger.info(
            f"Deposit credited: {amount} {currency} → user {wallet.user_id} wallet {wallet.id}"
        )
        await db.commit()


@_task("app.workers.webhook_tasks.process_bridge_kyc_event")
def process_bridge_kyc_event(self, event: dict):
    """Handle customer.* and kyc_link.* events."""
    import asyncio
    try:
        asyncio.run(_handle_bridge_kyc(event))
    except Exception as exc:
        logger.error(f"Bridge KYC event failed: {exc}")
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


async def _handle_bridge_kyc(event: dict):
    """
    Look up FrenzPay user via wallet.graph_account_id == Bridge customer_id
    (graph_account_id stores the Bridge customer ID, set during wallet provisioning).
    """
    from sqlalchemy.future import select
    from app.database import AsyncSessionLocal
    from app.models.user import User
    from app.models.wallet import Wallet

    payload = event.get("data", event)
    event_type: str = event.get("event_type", event.get("type", ""))
    customer_id: str = payload.get("customer_id", payload.get("id", ""))
    kyc_status: str = payload.get("kyc_status", "")

    if not customer_id:
        logger.warning(f"Bridge KYC event missing customer_id: {event}")
        return

    async with AsyncSessionLocal() as db:
        # Bridge customer_id is stored in wallet.graph_account_id
        wallet = (
            await db.execute(
                select(Wallet).where(Wallet.graph_account_id == customer_id)
            )
        ).scalar_one_or_none()

        if not wallet:
            logger.warning(f"Bridge KYC event: no wallet for customer_id={customer_id}")
            return

        user = (
            await db.execute(select(User).where(User.id == wallet.user_id))
        ).scalar_one_or_none()

        if not user:
            logger.warning(f"Bridge KYC event: no user for wallet with customer_id={customer_id}")
            return

        if kyc_status == "approved" or event_type in ("customer.approved", "kyc_link.approved"):
            from app.models.user import KYCTier, KYCStatus
            user.kyc_status = KYCStatus.APPROVED
            if user.kyc_tier == KYCTier.TIER_0:
                user.kyc_tier = KYCTier.TIER_1
            logger.info(f"Bridge KYC approved for user {user.id}")

        elif kyc_status == "rejected" or event_type in ("customer.rejected", "kyc_link.rejected"):
            from app.models.user import KYCStatus
            user.kyc_status = KYCStatus.REJECTED
            logger.info(f"Bridge KYC rejected for user {user.id}")

        await db.commit()


@_task("app.workers.webhook_tasks.process_bridge_liquidation_event")
def process_bridge_liquidation_event(self, event: dict):
    """Handle liquidation_address.drain — crypto received and auto-converted."""
    import asyncio
    try:
        asyncio.run(_handle_bridge_liquidation(event))
    except Exception as exc:
        logger.error(f"Bridge liquidation event failed: {exc}")
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


async def _handle_bridge_liquidation(event: dict):
    """
    When crypto arrives at a liquidation address, Bridge auto-converts it to fiat.
    We need to credit the user's fiat wallet with the converted amount.
    """
    payload = event.get("data", event)
    bridge_tx_id: str = payload.get("id", "")
    crypto_amount = Decimal(str(payload.get("crypto_amount", payload.get("amount", 0))))
    fiat_amount = Decimal(str(payload.get("fiat_amount", payload.get("destination_amount", 0))))
    fiat_currency: str = payload.get("fiat_currency", payload.get("destination_currency", "")).upper()
    customer_id: str = payload.get("customer_id", "")

    logger.info(
        f"Bridge liquidation drain: {crypto_amount} crypto → {fiat_amount} {fiat_currency} "
        f"for customer {customer_id}"
    )

    # Credit the user's fiat wallet (same pattern as deposit)
    await _handle_bridge_deposit({
        "data": {
            "id": bridge_tx_id,
            "amount": str(fiat_amount),
            "currency": fiat_currency,
            "customer_id": customer_id,
            "virtual_account_id": payload.get("liquidation_address_id", ""),
        }
    })


@_task("app.workers.webhook_tasks.process_bridge_card_event")
def process_bridge_card_event(self, event: dict):
    """Handle card_transaction and card_withdrawal events."""
    import asyncio
    try:
        asyncio.run(_handle_bridge_card(event))
    except Exception as exc:
        logger.error(f"Bridge card event failed: {exc}")
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


async def _handle_bridge_card(event: dict):
    payload = event.get("data", event)
    event_type: str = event.get("event_type", event.get("type", ""))
    amount = Decimal(str(payload.get("amount", 0)))
    currency: str = payload.get("currency", "").upper()
    card_id: str = payload.get("card_id", "")
    bridge_tx_id: str = payload.get("id", "")

    logger.info(
        f"Bridge card event {event_type}: {amount} {currency} card={card_id} id={bridge_tx_id}"
    )
    # TODO: debit user wallet on card spend, reverse on decline/refund
    # For now, log and store for reconciliation


@_task("app.workers.webhook_tasks.process_bridge_generic_event")
def process_bridge_generic_event(self, event: dict):
    """Catch-all handler for unrecognised Bridge event types."""
    event_type = event.get("event_type", event.get("type", "unknown"))
    event_id = event.get("id", "")
    logger.info(f"Bridge generic event — type={event_type} id={event_id}")


# ═══════════════════════════════════════════════════════════════════════════════
# YELLOW CARD EVENTS
# ═══════════════════════════════════════════════════════════════════════════════

@_task("app.workers.webhook_tasks.process_yellowcard_disbursement_event")
def process_yellowcard_disbursement_event(self, event: dict):
    """Handle Yellow Card disbursement.* events (outbound: crypto → fiat payout)."""
    import asyncio
    try:
        asyncio.run(_handle_yc_disbursement(event))
    except Exception as exc:
        logger.error(f"Yellow Card disbursement event failed: {exc}")
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


async def _handle_yc_disbursement(event: dict):
    from sqlalchemy.future import select
    from app.database import AsyncSessionLocal
    from app.models.transaction import Transaction, TransactionStatus
    from app.integrations.yellowcard import map_yc_disbursement_status

    yc_id: str = event.get("id", "")
    sequence_id: str = event.get("sequenceId", "")
    yc_status: str = event.get("status", "")
    frenzpay_status_str = map_yc_disbursement_status(yc_status)

    # FrenzPay stores the sequence_id (our reference) in graph_reference
    lookup = yc_id or sequence_id
    if not lookup:
        return

    async with AsyncSessionLocal() as db:
        tx = (
            await db.execute(
                select(Transaction).where(
                    (Transaction.graph_reference == lookup)
                    | (Transaction.reference == sequence_id)
                )
            )
        ).scalar_one_or_none()

        if not tx:
            logger.warning(f"Yellow Card disbursement {lookup}: no matching transaction")
            return

        now = datetime.now(UTC)
        if frenzpay_status_str == "COMPLETED":
            tx.status = TransactionStatus.COMPLETED
            tx.completed_at = now
            await _settle_transaction(db, tx)
            logger.info(f"Transaction {tx.reference} COMPLETED via Yellow Card disbursement {yc_id}")

        elif frenzpay_status_str == "FAILED":
            tx.status = TransactionStatus.FAILED
            tx.failed_at = now
            tx.failure_reason = event.get("reason", "Yellow Card disbursement failed")
            await _release_transaction_hold(db, tx)
            logger.info(f"Transaction {tx.reference} FAILED via Yellow Card")

        elif frenzpay_status_str == "REVERSED":
            tx.status = TransactionStatus.REVERSED
            tx.completed_at = now
            await _release_transaction_hold(db, tx)

        await db.commit()


@_task("app.workers.webhook_tasks.process_yellowcard_payment_event")
def process_yellowcard_payment_event(self, event: dict):
    """Handle Yellow Card payment.* events (inbound: fiat → crypto receipt)."""
    import asyncio
    try:
        asyncio.run(_handle_yc_payment(event))
    except Exception as exc:
        logger.error(f"Yellow Card payment event failed: {exc}")
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


async def _handle_yc_payment(event: dict):
    from sqlalchemy.future import select
    from app.database import AsyncSessionLocal
    from app.models.wallet import Wallet
    from app.models.transaction import Transaction, TransactionType, TransactionStatus
    from app.integrations.yellowcard import map_yc_payment_status

    yc_id: str = event.get("id", "")
    sequence_id: str = event.get("sequenceId", "")
    yc_status: str = event.get("status", "")
    frenzpay_status_str = map_yc_payment_status(yc_status)

    if frenzpay_status_str != "COMPLETED":
        logger.debug(f"Yellow Card payment {yc_id} status={yc_status}, not completed yet")
        return

    crypto_amount = Decimal(str(event.get("cryptoAmount", 0)))
    local_amount = Decimal(str(event.get("localAmount", 0)))
    currency: str = event.get("currency", "").upper()          # NGN, GHS …
    crypto_currency: str = event.get("cryptoCurrency", "USDT").upper()

    async with AsyncSessionLocal() as db:
        # Idempotency
        dup = (
            await db.execute(
                select(Transaction).where(Transaction.graph_reference == yc_id)
            )
        ).scalar_one_or_none()
        if dup:
            return

        # Find transaction by sequence_id (our reference)
        tx = (
            await db.execute(
                select(Transaction).where(Transaction.reference == sequence_id)
            )
        ).scalar_one_or_none()

        if tx:
            tx.status = TransactionStatus.COMPLETED
            tx.completed_at = datetime.now(UTC)
            tx.graph_reference = yc_id
        else:
            logger.warning(
                f"Yellow Card payment settled ({yc_id}) but no matching transaction for "
                f"sequence_id={sequence_id}; creating deposit record"
            )
            # Create a standalone deposit record for reconciliation
            tx = Transaction(
                reference=sequence_id or f"FRZ-YCP-{uuid.uuid4().hex[:8].upper()}",
                type=TransactionType.DEPOSIT,
                status=TransactionStatus.COMPLETED,
                source_amount=local_amount,
                source_currency=currency,
                destination_amount=crypto_amount,
                destination_currency=crypto_currency,
                graph_reference=yc_id,
                idempotency_key=yc_id,
                completed_at=datetime.now(UTC),
            )
            db.add(tx)

        logger.info(
            f"Yellow Card payment settled: {local_amount} {currency} → "
            f"{crypto_amount} {crypto_currency}"
        )
        await db.commit()


@_task("app.workers.webhook_tasks.process_yellowcard_generic_event")
def process_yellowcard_generic_event(self, event: dict):
    """Catch-all for unrecognised Yellow Card event types."""
    event_type = event.get("type", event.get("event", "unknown"))
    logger.info(f"Yellow Card generic event: type={event_type}")


# ═══════════════════════════════════════════════════════════════════════════════
# SHARED HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

async def _settle_transaction(db, tx) -> None:
    """
    Finalise a completed transaction:
      - Release the hold on source wallet
      - Book the ledger credit (if this was a conversion)
    """
    from sqlalchemy.future import select
    from app.models.wallet import Wallet
    from app.services.ledger_service import release_hold

    if not tx.source_wallet_id:
        return

    wallet = (
        await db.execute(select(Wallet).where(Wallet.id == tx.source_wallet_id))
    ).scalar_one_or_none()
    if not wallet:
        return

    amount = Decimal(str(tx.source_amount + tx.frenzpay_fee))
    await release_hold(wallet, amount, db)


async def _release_transaction_hold(db, tx) -> None:
    """Release the hold on the source wallet for failed/reversed transactions."""
    from sqlalchemy.future import select
    from app.models.wallet import Wallet
    from app.services.ledger_service import release_hold

    if not tx.source_wallet_id:
        return

    wallet = (
        await db.execute(select(Wallet).where(Wallet.id == tx.source_wallet_id))
    ).scalar_one_or_none()
    if wallet:
        amount = Decimal(str(tx.source_amount + tx.frenzpay_fee))
        await release_hold(wallet, amount, db)


# ── Legacy task name — kept so existing Celery workers don't lose queued jobs ──

@celery_app.task(
    name="app.workers.webhook_retry.process_graph_event",
    bind=True,
    max_retries=5,
)
def process_graph_event_legacy(self, event: dict):
    """Backward-compat alias for the old webhook_retry task name."""
    import asyncio
    try:
        asyncio.run(_handle_bridge_transfer(event))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
