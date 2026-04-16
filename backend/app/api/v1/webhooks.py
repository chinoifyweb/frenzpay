"""
Webhook endpoints — Bridge, Dojah, and Yellow Card.

All webhooks are:
  1. Signature-verified immediately (synchronous, fast)
  2. Parsed to extract event type + ID
  3. Queued to Celery for actual processing (never processed inline)

This keeps webhook response times under 200ms regardless of downstream latency.
"""

import json

from fastapi import APIRouter, HTTPException, Request

from app.core.logging import get_logger
from app.integrations.dojah.verification import verify_dojah_signature
from app.integrations.graph.webhooks import verify_bridge_signature
from app.integrations.yellowcard import verify_yellowcard_signature
from app.workers.celery_app import celery_app

logger = get_logger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


# ── Bridge ────────────────────────────────────────────────────────────────────
#
# Bridge sends a "Webhook-Signature" header containing a base64-encoded
# RSA-SHA256 signature of the raw request body.
#
# Supported event types:
#   customer.*                   — customer status changes (approved, rejected, …)
#   kyc_link.*                   — KYC link status updates
#   transfer.*                   — transfer state machine transitions
#   virtual_account.activity     — inbound funds received on a virtual account
#   liquidation_address.drain    — crypto received and converted on a liq. address
#   bridge_wallet.activity       — Bridge wallet activity
#   card_transaction             — card spend event
#   card_withdrawal              — card ATM withdrawal
#   external_account.*           — external account verified / failed

@router.post("/bridge")
async def bridge_webhook(request: Request):
    body = await request.body()

    # Bridge uses "Webhook-Signature"; also accept legacy "x-graph-signature"
    signature = (
        request.headers.get("Webhook-Signature")
        or request.headers.get("x-bridge-signature")
        or request.headers.get("x-graph-signature")
        or ""
    )

    if not verify_bridge_signature(body, signature):
        logger.warning("Bridge webhook: invalid signature")
        raise HTTPException(401, "Invalid signature")

    try:
        event = json.loads(body)
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    event_type: str = event.get("event_type", event.get("type", "unknown"))
    event_id: str = event.get("id", "")

    logger.info(f"Bridge webhook received: type={event_type} id={event_id}")

    # Route to the appropriate Celery task
    if event_type.startswith("transfer.") or event_type == "transfer":
        celery_app.send_task(
            "app.workers.webhook_tasks.process_bridge_transfer_event", args=[event]
        )
    elif event_type.startswith("virtual_account.") or event_type == "virtual_account.activity":
        celery_app.send_task(
            "app.workers.webhook_tasks.process_bridge_virtual_account_event", args=[event]
        )
    elif event_type.startswith("kyc_link.") or event_type.startswith("customer."):
        celery_app.send_task(
            "app.workers.webhook_tasks.process_bridge_kyc_event", args=[event]
        )
    elif event_type == "liquidation_address.drain":
        celery_app.send_task(
            "app.workers.webhook_tasks.process_bridge_liquidation_event", args=[event]
        )
    elif event_type.startswith("card_"):
        celery_app.send_task(
            "app.workers.webhook_tasks.process_bridge_card_event", args=[event]
        )
    else:
        # Catch-all for any new event types
        celery_app.send_task(
            "app.workers.webhook_tasks.process_bridge_generic_event", args=[event]
        )

    return {"status": "accepted", "event_type": event_type, "id": event_id}


# Legacy URL kept for backward compatibility (Bridge dashboard may still have old URL)
@router.post("/graph")
async def graph_webhook_legacy(request: Request):
    """Legacy endpoint alias — routes to the same Bridge handler."""
    return await bridge_webhook(request)


# ── Dojah ─────────────────────────────────────────────────────────────────────
#
# Dojah signs webhooks with HMAC-SHA512 in the "x-dojah-signature" header.
#
# Event types:
#   kyc.bvn.verified / kyc.nin.verified
#   kyc.selfie.passed / kyc.selfie.failed
#   kyc.liveness.passed / kyc.liveness.failed
#   kyc.document.approved / kyc.document.rejected

@router.post("/dojah")
async def dojah_webhook(request: Request):
    body = await request.body()
    signature = (
        request.headers.get("x-dojah-signature")
        or request.headers.get("x-webhook-signature")
        or ""
    )

    if not verify_dojah_signature(body, signature):
        logger.warning("Dojah webhook: invalid signature")
        raise HTTPException(401, "Invalid signature")

    try:
        event = json.loads(body)
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    event_type: str = event.get("type", event.get("event", "unknown"))
    reference: str = event.get("reference", event.get("app_id", ""))

    logger.info(f"Dojah webhook received: type={event_type} ref={reference}")

    celery_app.send_task(
        "app.workers.kyc_tasks.process_dojah_webhook", args=[event]
    )

    return {"status": "accepted", "event_type": event_type}


# ── Yellow Card ───────────────────────────────────────────────────────────────
#
# Yellow Card signs webhooks with HMAC-SHA256 in the "X-YC-Signature" header.
#
# Event types:
#   payment.pending / payment.confirming / payment.settled / payment.failed / payment.expired
#   disbursement.pending / disbursement.processing / disbursement.paid / disbursement.failed

@router.post("/yellowcard")
async def yellowcard_webhook(request: Request):
    body = await request.body()
    signature = (
        request.headers.get("X-YC-Signature")
        or request.headers.get("x-yc-signature")
        or ""
    )

    if not verify_yellowcard_signature(body, signature):
        logger.warning("Yellow Card webhook: invalid signature")
        raise HTTPException(401, "Invalid signature")

    try:
        event = json.loads(body)
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    event_type: str = event.get("type", event.get("event", "unknown"))
    event_id: str = event.get("id", event.get("sequenceId", ""))

    logger.info(f"Yellow Card webhook received: type={event_type} id={event_id}")

    if event_type.startswith("payment."):
        celery_app.send_task(
            "app.workers.webhook_tasks.process_yellowcard_payment_event", args=[event]
        )
    elif event_type.startswith("disbursement."):
        celery_app.send_task(
            "app.workers.webhook_tasks.process_yellowcard_disbursement_event", args=[event]
        )
    else:
        celery_app.send_task(
            "app.workers.webhook_tasks.process_yellowcard_generic_event", args=[event]
        )

    return {"status": "accepted", "event_type": event_type, "id": event_id}
