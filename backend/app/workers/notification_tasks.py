import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.notification_tasks.send_email")
def send_email(to: str, subject: str, html: str, text: str = ""):
    import asyncio
    asyncio.run(_send_email(to, subject, html, text))


async def _send_email(to: str, subject: str, html: str, text: str = ""):
    """Send a transactional email via Purelymail API."""
    import httpx
    from app.config import settings

    if not settings.PURELYMAIL_API_KEY:
        logger.warning(f"PURELYMAIL_API_KEY not set — skipping email to {to}")
        return

    payload: dict = {
        "routingToken": settings.PURELYMAIL_API_KEY,
        "to": to,
        "from": settings.FROM_EMAIL,
        "subject": subject,
    }
    if html:
        payload["bodyHtml"] = html
    if text:
        payload["body"] = text
    elif html:
        # Strip basic tags for plain-text fallback
        import re
        payload["body"] = re.sub(r"<[^>]+>", "", html)

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://purelymail.com/api/sendMessage",
                json=payload,
            )
        if resp.is_success:
            data = resp.json()
            if data.get("errorCode"):
                logger.error(
                    f"Purelymail rejected email to {to}: "
                    f"[{data['errorCode']}] {data.get('errorMessage', '')}"
                )
            else:
                logger.info(f"Email sent to {to} via Purelymail — subject: {subject!r}")
        else:
            logger.error(
                f"Purelymail HTTP error for email to {to}: "
                f"{resp.status_code} {resp.text[:200]}"
            )
    except Exception as exc:
        logger.exception(f"Unexpected error sending email to {to}: {exc}")


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
