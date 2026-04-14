"""
Webhook endpoints for Graph and Dojah.
Webhooks are verified, then queued to Celery — never processed inline.
"""

from fastapi import APIRouter, HTTPException, Request

from app.core.logging import get_logger
from app.integrations.dojah.verification import verify_dojah_signature
from app.integrations.graph.webhooks import verify_graph_signature
from app.workers.celery_app import celery_app

logger = get_logger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/graph")
async def graph_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("x-graph-signature", "")

    if not verify_graph_signature(body, signature):
        raise HTTPException(401, "Invalid signature")

    try:
        event = request.app.state  # parsed below
        import json
        event = json.loads(body)
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    event_id = event.get("id", "")
    event_type = event.get("type", "")
    logger.info(f"Graph webhook received: {event_type} id={event_id}")

    # Queue to Celery — do not process inline
    celery_app.send_task("app.workers.webhook_retry.process_graph_event", args=[event])

    return {"status": "accepted"}


@router.post("/dojah")
async def dojah_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("x-dojah-signature", "")

    if not verify_dojah_signature(body, signature):
        raise HTTPException(401, "Invalid signature")

    import json
    try:
        event = json.loads(body)
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    logger.info(f"Dojah webhook: {event.get('type')} ref={event.get('reference')}")

    celery_app.send_task("app.workers.kyc_tasks.process_dojah_webhook", args=[event])

    return {"status": "accepted"}
