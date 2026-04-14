import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.notification_tasks.send_email", bind=True, max_retries=3)
def send_email(self, to: str, subject: str, html: str, text: str = ""):
    """Send a transactional email via Purelymail SMTP (SSL on port 465)."""
    from app.config import settings

    if not settings.SMTP_PASSWORD:
        logger.warning(f"SMTP_PASSWORD not set — skipping email to {to}")
        return

    # Build MIME message
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"FrenzPay <{settings.FROM_EMAIL}>"
    msg["To"] = to

    # Plain-text fallback
    if not text and html:
        import re
        text = re.sub(r"<[^>]+>", "", html).strip()

    if text:
        msg.attach(MIMEText(text, "plain", "utf-8"))
    if html:
        msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.ehlo()
            server.starttls(context=ctx)
            server.ehlo()
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.sendmail(settings.FROM_EMAIL, [to], msg.as_string())
        logger.info(f"Email sent to {to} via Purelymail SMTP — subject: {subject!r}")
    except smtplib.SMTPAuthenticationError as exc:
        logger.error(f"SMTP auth failed sending to {to}: {exc}")
        raise self.retry(exc=exc, countdown=60)
    except smtplib.SMTPException as exc:
        logger.error(f"SMTP error sending to {to}: {exc}")
        raise self.retry(exc=exc, countdown=30)
    except Exception as exc:
        logger.exception(f"Unexpected error sending email to {to}: {exc}")
        raise self.retry(exc=exc, countdown=60)


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
