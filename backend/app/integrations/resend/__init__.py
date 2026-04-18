"""
Resend email integration (alternative to Purelymail SMTP).
Used when RESEND_API_KEY is set in settings — falls back to Purelymail SMTP otherwise.
Docs: https://resend.com/docs
"""

import logging

import httpx

logger = logging.getLogger(__name__)

RESEND_BASE = "https://api.resend.com"


async def send_email(
    to: str,
    subject: str,
    html: str,
    from_address: str = "FrenzPay <noreply@frenzpay.co>",
    reply_to: str | None = None,
) -> bool:
    """
    Send a transactional email via Resend API.
    Returns True on success, False on failure.
    Requires RESEND_API_KEY in settings.
    """
    from app.config import settings

    api_key = getattr(settings, "RESEND_API_KEY", "")
    if not api_key:
        logger.warning("RESEND_API_KEY not set — use Purelymail SMTP instead")
        return False

    payload: dict = {
        "from": from_address,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if reply_to:
        payload["reply_to"] = reply_to

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{RESEND_BASE}/emails",
                json=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
            if resp.is_success:
                data = resp.json()
                logger.info(f"Resend email sent to {to}: id={data.get('id')} subject={subject!r}")
                return True
            else:
                logger.error(f"Resend API error ({resp.status_code}): {resp.text}")
                return False
    except Exception as exc:
        logger.error(f"Resend send_email exception: {exc}")
        return False
