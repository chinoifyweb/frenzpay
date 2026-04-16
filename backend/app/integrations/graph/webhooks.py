"""
Bridge webhook signature verification.

Bridge signs webhook payloads with an RSA-256 private key.
You verify using the PUBLIC KEY (PEM) available in the Bridge dashboard
→ Developers → Webhooks → Signing Key.

The signature is in the  "Webhook-Signature"  HTTP header as a base64-encoded
RSA-SHA256 digest of the raw request body.

Fallback: if BRIDGE_WEBHOOK_PUBLIC_KEY is not set, verification is skipped
(dev mode) and a warning is logged.
"""

import base64
import logging

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from app.config import settings

logger = logging.getLogger(__name__)


def verify_bridge_signature(body: bytes, signature_b64: str) -> bool:
    """
    Returns True if the Bridge webhook signature is valid.

    Args:
        body:          Raw request body bytes (not parsed).
        signature_b64: Value of the "Webhook-Signature" HTTP header (base64).
    """
    public_key_pem = settings.BRIDGE_WEBHOOK_PUBLIC_KEY.strip()

    if not public_key_pem:
        # Dev mode — no key configured, accept all
        logger.warning(
            "BRIDGE_WEBHOOK_PUBLIC_KEY is not set — skipping signature verification (dev mode)"
        )
        return True

    try:
        signature = base64.b64decode(signature_b64)
    except Exception:
        logger.error("Bridge webhook: could not base64-decode signature header")
        return False

    try:
        public_key = serialization.load_pem_public_key(public_key_pem.encode())
        public_key.verify(  # type: ignore[attr-defined]
            signature,
            body,
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True
    except InvalidSignature:
        logger.warning("Bridge webhook: RSA signature mismatch")
        return False
    except Exception as exc:
        logger.error(f"Bridge webhook: verification error — {exc}")
        return False


# Aliases for backward compatibility
verify_graph_signature = verify_bridge_signature
