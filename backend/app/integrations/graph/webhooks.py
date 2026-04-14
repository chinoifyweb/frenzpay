import hashlib
import hmac

from app.config import settings


def verify_graph_signature(body: bytes, signature: str) -> bool:
    """HMAC-SHA256 signature verification for Graph webhooks."""
    secret = settings.GRAPH_WEBHOOK_SECRET
    if not secret:
        return True  # dev mode
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
