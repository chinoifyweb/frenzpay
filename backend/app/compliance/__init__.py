"""
FrenzPay Compliance Module

Responsibilities:
  1. KYC tier enforcement — checked in transaction_service before any outbound tx
  2. Velocity / spend-limit rules — checked per-tier in transaction_service
  3. AML monitoring — Celery task that flags suspicious patterns post-transaction
  4. Suspicious transaction reporting — auto-flag to admin review queue

This module exposes helpers used by transaction_service and the AML Celery task.
"""

from decimal import Decimal

# ── AML thresholds ────────────────────────────────────────────────────────────

# CTR (Currency Transaction Report) threshold — flag any single tx >= $10,000 USD equivalent
CTR_THRESHOLD_USD = Decimal("10000")

# SAR (Suspicious Activity Report) trigger thresholds
SAR_STRUCTURING_WINDOW_HOURS = 24       # Watch for structuring within 24 hours
SAR_STRUCTURING_THRESHOLD_USD = Decimal("9500")  # Flag if total within window approaches CTR
SAR_RAPID_SUCCESSION_COUNT = 5          # Flag if > 5 transactions within 1 hour
SAR_RAPID_SUCCESSION_WINDOW_MINUTES = 60

# Velocity: flag if monthly spend exceeds 3x their tier limit (possible account takeover)
VELOCITY_MULTIPLIER = 3


def is_large_transaction(amount_usd: Decimal) -> bool:
    """Returns True if the transaction meets or exceeds the CTR threshold."""
    return amount_usd >= CTR_THRESHOLD_USD


def requires_enhanced_due_diligence(amount_usd: Decimal, kyc_tier: str) -> bool:
    """Returns True if the transaction requires enhanced due diligence review."""
    if kyc_tier == "TIER_0":
        return True  # Should never reach here — blocked at service layer
    if amount_usd >= CTR_THRESHOLD_USD and kyc_tier != "TIER_3":
        return True
    return False


async def check_structuring_risk(
    user_id: str, amount: Decimal, db
) -> bool:
    """
    Check if this transaction looks like structuring (multiple transactions
    just below the CTR threshold within a short window).
    Returns True if suspicious.
    """
    from datetime import UTC, datetime, timedelta
    from decimal import Decimal
    from sqlalchemy import func, select
    from app.models.transaction import Transaction, TransactionStatus
    import uuid

    window_start = datetime.now(UTC) - timedelta(hours=SAR_STRUCTURING_WINDOW_HOURS)

    recent_total = (
        await db.execute(
            select(func.coalesce(func.sum(Transaction.source_amount), 0)).where(
                Transaction.user_id == uuid.UUID(user_id) if isinstance(user_id, str) else user_id,
                Transaction.status.notin_([TransactionStatus.FAILED, TransactionStatus.REVERSED]),
                Transaction.initiated_at >= window_start,
            )
        )
    ).scalar()

    return Decimal(str(recent_total)) + amount >= SAR_STRUCTURING_THRESHOLD_USD


async def check_rapid_succession(user_id: str, db) -> bool:
    """
    Check for rapid-fire transactions (potential account takeover or fraud).
    Returns True if suspicious.
    """
    from datetime import UTC, datetime, timedelta
    from sqlalchemy import func, select
    from app.models.transaction import Transaction
    import uuid

    window_start = datetime.now(UTC) - timedelta(minutes=SAR_RAPID_SUCCESSION_WINDOW_MINUTES)

    count = (
        await db.execute(
            select(func.count(Transaction.id)).where(
                Transaction.user_id == uuid.UUID(user_id) if isinstance(user_id, str) else user_id,
                Transaction.initiated_at >= window_start,
            )
        )
    ).scalar()

    return count >= SAR_RAPID_SUCCESSION_COUNT


async def flag_suspicious_transaction(
    transaction_id: str,
    user_id: str,
    reason: str,
    severity: str,  # "LOW", "MEDIUM", "HIGH", "CRITICAL"
    db,
) -> None:
    """
    Write a risk flag to the audit log and alert ops via Telegram.
    """
    from app.core.logging import get_logger
    logger = get_logger(__name__)

    logger.warning(
        f"AML ALERT [{severity}] tx={transaction_id} user={user_id} reason={reason}"
    )

    # Write audit log entry
    from app.models.audit_log import AuditLog
    import uuid
    log = AuditLog(
        user_id=uuid.UUID(user_id) if isinstance(user_id, str) else user_id,
        action="AML_FLAG",
        resource_type="transaction",
        resource_id=transaction_id,
        log_metadata={"reason": reason, "severity": severity},
    )
    db.add(log)

    # Alert ops for HIGH/CRITICAL
    if severity in ("HIGH", "CRITICAL"):
        _alert_ops_async(transaction_id, user_id, reason, severity)


def _alert_ops_async(tx_id: str, user_id: str, reason: str, severity: str) -> None:
    """Non-blocking Telegram alert to ops."""
    import httpx
    from app.config import settings

    if not settings.ADMIN_ALERT_TELEGRAM_BOT_TOKEN:
        return

    msg = (
        f"🚨 AML {severity} ALERT\n"
        f"Transaction: {tx_id}\n"
        f"User: {user_id}\n"
        f"Reason: {reason}\n"
        f"Action: Review in admin panel → Risk"
    )

    try:
        httpx.post(
            f"https://api.telegram.org/bot{settings.ADMIN_ALERT_TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": settings.ADMIN_ALERT_CHAT_ID, "text": msg},
            timeout=5,
        )
    except Exception:
        pass  # Never block on alerts
