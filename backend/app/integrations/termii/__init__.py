"""
Termii SMS integration — send transactional SMS (OTP, alerts) via Termii API.
Docs: https://developers.termii.com
"""

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

TERMII_BASE = "https://api.ng.termii.com/api"


async def send_sms(phone: str, message: str) -> bool:
    """
    Send a plain-text SMS via Termii.
    Returns True on success, False on failure (non-blocking — never raises).
    """
    if not settings.TERMII_API_KEY:
        logger.warning(f"TERMII_API_KEY not set — skipping SMS to {phone}")
        return False

    payload = {
        "to": phone,
        "from": settings.TERMII_SENDER_ID,
        "sms": message,
        "type": "plain",
        "api_key": settings.TERMII_API_KEY,
        "channel": "dnd",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(f"{TERMII_BASE}/sms/send", json=payload)
            if resp.is_success:
                logger.info(f"SMS sent to {phone} via Termii")
                return True
            else:
                logger.error(f"Termii SMS failed ({resp.status_code}): {resp.text}")
                return False
    except Exception as exc:
        logger.error(f"Termii SMS exception for {phone}: {exc}")
        return False


async def send_otp(phone: str, otp: str, purpose: str = "verification") -> bool:
    """Send a formatted OTP message."""
    message = (
        f"Your FrenzPay {purpose} code is: {otp}. "
        f"Valid for {settings.OTP_TTL_MINUTES} minutes. Do not share."
    )
    return await send_sms(phone, message)


async def send_login_alert(phone: str, ip: str) -> bool:
    """Notify user of a new login via SMS."""
    message = (
        f"FrenzPay: New sign-in from IP {ip}. "
        "If this wasn't you, change your password immediately."
    )
    return await send_sms(phone, message)


async def send_transaction_alert(phone: str, amount: float, currency: str, reference: str) -> bool:
    """Notify user of a completed transaction."""
    message = (
        f"FrenzPay: {currency} {amount:.2f} sent. "
        f"Ref: {reference}. Not you? Contact support immediately."
    )
    return await send_sms(phone, message)
