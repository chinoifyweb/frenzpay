"""
Dojah webhook signature verification.
Dojah signs webhooks with HMAC-SHA512.
"""

import hashlib
import hmac

from app.config import settings


def verify_dojah_signature(body: bytes, signature: str) -> bool:
    """
    Returns True if the webhook signature is valid.
    """
    secret = settings.DOJAH_WEBHOOK_SECRET
    if not secret:
        return True  # Skip verification in dev if secret not set

    expected = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)
