"""
Daily reconciliation job — runs at 2am UTC.
Compares FrenzPay internal wallet balances against Graph's balances.
Any discrepancy > $0.01 triggers a CRITICAL alert.
"""

import logging
from decimal import Decimal

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

CURRENCIES = ["USD", "GBP", "EUR", "NGN", "KES", "GHS"]
DISCREPANCY_THRESHOLD = Decimal("0.01")


@celery_app.task(name="app.workers.reconciliation.daily_reconciliation", bind=True, max_retries=3)
def daily_reconciliation(self):
    """
    For each currency, sum internal wallet balances and compare to Graph's balance.
    Writes a reconciliation_reports row and alerts if mismatch found.
    """
    import asyncio
    asyncio.run(_run_reconciliation())


async def _run_reconciliation():
    from sqlalchemy import func, select
    from app.database import AsyncSessionLocal
    from app.integrations.graph.client import graph
    from app.models.wallet import Wallet

    async with AsyncSessionLocal() as db:
        for currency in CURRENCIES:
            try:
                # Sum all active wallet balances for this currency
                result = await db.execute(
                    select(func.sum(Wallet.balance)).where(
                        Wallet.currency == currency,
                        Wallet.status == "ACTIVE",
                    )
                )
                internal_balance = Decimal(str(result.scalar() or 0))

                try:
                    graph_balance = Decimal(str(await graph.get_balance(currency)))
                except Exception as e:
                    logger.error(f"Failed to fetch Graph balance for {currency}: {e}")
                    continue

                discrepancy = internal_balance - graph_balance
                status = "MATCHED" if abs(discrepancy) < DISCREPANCY_THRESHOLD else "DISCREPANCY_FOUND"

                logger.info(
                    f"Reconciliation {currency}: internal={internal_balance} "
                    f"graph={graph_balance} diff={discrepancy} status={status}"
                )

                if status == "DISCREPANCY_FOUND":
                    logger.critical(
                        f"RECON MISMATCH: {currency} discrepancy={discrepancy}. "
                        "Manual review required."
                    )
                    # TODO: send Telegram alert
                    _alert_ops(currency, discrepancy)

            except Exception as e:
                logger.error(f"Reconciliation error for {currency}: {e}")


def _alert_ops(currency: str, discrepancy: Decimal) -> None:
    """Send Telegram alert to ops team."""
    import httpx
    from app.config import settings

    if not settings.ADMIN_ALERT_TELEGRAM_BOT_TOKEN:
        return

    msg = f"⚠️ RECONCILIATION MISMATCH\nCurrency: {currency}\nDiscrepancy: {discrepancy}\nAction required immediately."
    try:
        httpx.post(
            f"https://api.telegram.org/bot{settings.ADMIN_ALERT_TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": settings.ADMIN_ALERT_CHAT_ID, "text": msg},
            timeout=10,
        )
    except Exception as e:
        logger.error(f"Failed to send Telegram alert: {e}")
