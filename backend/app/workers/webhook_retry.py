"""
Process Graph webhooks asynchronously with idempotency.
"""

import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    name="app.workers.webhook_retry.process_graph_event",
    bind=True,
    max_retries=5,
    default_retry_delay=60,  # 1 min, doubles on each retry (exponential backoff)
)
def process_graph_event(self, event: dict):
    import asyncio
    try:
        asyncio.run(_handle_graph_event(event))
    except Exception as exc:
        logger.error(f"Graph webhook processing failed: {exc}")
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


async def _handle_graph_event(event: dict):
    from sqlalchemy.future import select
    from app.database import AsyncSessionLocal
    from app.models.transaction import Transaction, TransactionStatus
    from datetime import UTC, datetime

    event_id = event.get("id", "")
    event_type = event.get("type", "")

    async with AsyncSessionLocal() as db:
        # Idempotency check — have we already processed this event?
        result = await db.execute(
            select(Transaction).where(Transaction.graph_reference == event_id)
        )
        existing = result.scalar_one_or_none()

        if event_type in ("transfer.completed", "payout.completed"):
            if existing:
                existing.status = TransactionStatus.COMPLETED
                from datetime import UTC, datetime
                existing.completed_at = datetime.now(UTC)
                logger.info(f"Transaction {existing.reference} marked COMPLETED")

        elif event_type in ("transfer.failed", "payout.failed"):
            if existing:
                existing.status = TransactionStatus.FAILED
                existing.failed_at = datetime.now(UTC)
                existing.failure_reason = event.get("data", {}).get("reason", "Unknown")

                # Release the held funds back to available balance
                from decimal import Decimal
                from app.models.wallet import Wallet
                wallet_result = await db.execute(
                    select(Wallet).where(Wallet.id == existing.source_wallet_id)
                )
                wallet = wallet_result.scalar_one_or_none()
                if wallet:
                    from app.services.ledger_service import release_hold
                    await release_hold(wallet, Decimal(str(existing.source_amount)), db)

                logger.info(f"Transaction {existing.reference} marked FAILED")

        elif event_type == "deposit.completed":
            # Inbound deposit — credit the user's wallet
            data = event.get("data", {})
            await _process_deposit(db, data)

        await db.commit()


async def _process_deposit(db, data: dict):
    """Credit a user's wallet on inbound deposit webhook."""
    from decimal import Decimal
    from sqlalchemy.future import select
    from app.models.wallet import Wallet, VirtualAccount
    from app.models.transaction import Transaction, TransactionType, TransactionStatus
    from app.services.ledger_service import post_journal_entry
    import uuid

    provider_ref = data.get("virtual_account_id", "")
    amount = Decimal(str(data.get("amount", 0)))
    currency = data.get("currency", "")

    if not provider_ref or amount <= 0:
        return

    # Find the virtual account and its wallet
    va_result = await db.execute(
        select(VirtualAccount).where(VirtualAccount.provider_reference == provider_ref)
    )
    va = va_result.scalar_one_or_none()
    if not va:
        logger.error(f"Deposit for unknown virtual account: {provider_ref}")
        return

    wallet_result = await db.execute(select(Wallet).where(Wallet.id == va.wallet_id))
    wallet = wallet_result.scalar_one_or_none()
    if not wallet:
        return

    # System incoming wallet (platform float account)
    sys_wallet_result = await db.execute(
        select(Wallet).where(Wallet.graph_account_id == f"system_incoming_{currency}")
    )
    system_wallet = sys_wallet_result.scalar_one_or_none()
    if not system_wallet:
        logger.error(f"No system incoming wallet for {currency}")
        return

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
        graph_reference=data.get("id", ""),
        idempotency_key=data.get("id", str(uuid.uuid4())),
    )
    db.add(tx)
    await db.flush()

    await post_journal_entry(db, tx, system_wallet, wallet, amount, currency, "Inbound deposit")
    logger.info(f"Deposit credited: {amount} {currency} → wallet {wallet.id}")
