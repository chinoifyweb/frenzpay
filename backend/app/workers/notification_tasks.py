import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.notification_tasks.send_email")
def send_email(to: str, subject: str, html: str):
    import asyncio
    asyncio.run(_send(to, subject, html))


async def _send(to: str, subject: str, html: str):
    import httpx
    from app.config import settings

    if not settings.RESEND_API_KEY:
        logger.warning(f"RESEND_API_KEY not set — skipping email to {to}")
        return

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            json={"from": settings.FROM_EMAIL, "to": [to], "subject": subject, "html": html},
        )
        if not resp.is_success:
            logger.error(f"Resend email failed: {resp.status_code} {resp.text}")


@celery_app.task(name="app.workers.notification_tasks.send_sms")
def send_sms(phone: str, message: str):
    import asyncio
    asyncio.run(_send_sms(phone, message))


async def _send_sms(phone: str, message: str):
    import httpx
    from app.config import settings

    if not settings.TERMII_API_KEY:
        logger.warning(f"TERMII_API_KEY not set — skipping SMS to {phone}")
        return

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.ng.termii.com/api/sms/send",
            json={
                "to": phone,
                "from": settings.TERMII_SENDER_ID,
                "sms": message,
                "type": "plain",
                "api_key": settings.TERMII_API_KEY,
                "channel": "dnd",
            },
        )
        if not resp.is_success:
            logger.error(f"Termii SMS failed: {resp.status_code} {resp.text}")
