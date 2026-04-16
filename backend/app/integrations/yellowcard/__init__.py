"""
Yellow Card API client — African crypto/fiat bridge for FrenzPay.
https://yellowcard.stoplight.io/docs/api-v3

Yellow Card provides:
  - Exchange rates (NGN/GHS/KES/ZAR/UGX ↔ USDT/USDC/BTC)
  - Payment channels (bank accounts, mobile money per country)
  - Payments     — customer sends local fiat → Yellow Card → FrenzPay gets crypto
  - Disbursements — FrenzPay sends crypto → Yellow Card → customer receives local fiat
  - Network lookup — resolve phone or account number to a Yellow Card user

Auth: every request is HMAC-SHA256 signed.
Headers:
  X-YC-Timestamp:  Unix epoch milliseconds (str)
  X-YC-Signature:  hex(HMAC-SHA256(secret, timestamp + METHOD + path + raw_body))
  X-YC-Key:        API key

Supported countries (v3): NG, GH, KE, ZA, TZ, UG, ZM, CM, CI, SN
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any

import httpx

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_YC_BASE = "https://api.yellowcard.io"


# ── Auth helpers ──────────────────────────────────────────────────────────────

def _sign(method: str, path: str, body: str = "") -> tuple[str, str]:
    """
    Returns (timestamp_ms, hex_signature).

    Signature message = timestamp + METHOD.upper() + path + raw_body
    """
    timestamp = str(int(time.time() * 1000))
    message = timestamp + method.upper() + path + body
    sig = hmac.new(
        settings.YELLOWCARD_SECRET_KEY.encode(),
        message.encode(),
        hashlib.sha256,
    ).hexdigest()
    return timestamp, sig


def _headers(method: str, path: str, body: str = "") -> dict[str, str]:
    ts, sig = _sign(method, path, body)
    return {
        "X-YC-Timestamp": ts,
        "X-YC-Signature": sig,
        "X-YC-Key": settings.YELLOWCARD_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _client(timeout: int = 30) -> httpx.AsyncClient:
    base = getattr(settings, "YELLOWCARD_BASE_URL", _YC_BASE)
    return httpx.AsyncClient(base_url=base, timeout=timeout)


# ── Response types ─────────────────────────────────────────────────────────────

class YCRate:
    """Exchange rate between crypto and a local currency."""
    def __init__(self, data: dict):
        self.crypto: str = data.get("code", "")          # USDT, USDC, BTC
        self.country: str = data.get("country", "")       # NG, GH, KE …
        self.currency: str = data.get("localCurrency", "") # NGN, GHS, KES …
        self.buy_rate: float = float(data.get("buy", data.get("buying", 0)))
        self.sell_rate: float = float(data.get("sell", data.get("selling", 0)))
        self.min_amount: float = float(data.get("minAmount", 0))
        self.max_amount: float = float(data.get("maxAmount", 0))
        self.raw: dict = data


class YCChannel:
    """A payment channel — defines a way to send or receive local currency."""
    def __init__(self, data: dict):
        self.id: str = data.get("id", "")
        self.name: str = data.get("name", "")
        self.country: str = data.get("country", "")
        self.currency: str = data.get("currency", "")   # NGN, GHS …
        self.status: str = data.get("status", "")
        self.channel_type: str = data.get("channelType", "")  # bank | momo
        self.is_mobile_money: bool = data.get("isMobileMoney", False)
        self.raw: dict = data


class YCPayment:
    """
    An inbound payment (customer → Yellow Card → FrenzPay).

    Status flow: pending → confirming → settled | failed | expired
    """
    def __init__(self, data: dict):
        self.id: str = data.get("id", "")
        self.sequence_id: str = data.get("sequenceId", "")
        self.status: str = data.get("status", "")
        self.crypto_amount: float = float(data.get("cryptoAmount", 0))
        self.local_amount: float = float(data.get("localAmount", 0))
        self.currency: str = data.get("currency", "")
        self.crypto_currency: str = data.get("cryptoCurrency", "USDT")
        self.account_reference: str = data.get("accountReference", "")
        self.account_name: str = data.get("accountName", "")
        self.created_at: str = data.get("createdAt", "")
        self.updated_at: str = data.get("updatedAt", "")
        self.raw: dict = data


class YCDisbursement:
    """
    An outbound disbursement (FrenzPay → Yellow Card → customer).

    Status flow: pending → processing → paid | failed
    """
    def __init__(self, data: dict):
        self.id: str = data.get("id", "")
        self.sequence_id: str = data.get("sequenceId", "")
        self.status: str = data.get("status", "")
        self.amount: float = float(data.get("amount", 0))
        self.local_amount: float = float(data.get("localAmount", 0))
        self.currency: str = data.get("currency", "")
        self.crypto_currency: str = data.get("cryptoCurrency", "USDT")
        self.recipient_name: str = data.get("recipientName", "")
        self.destination: dict = data.get("destination", {})
        self.created_at: str = data.get("createdAt", "")
        self.updated_at: str = data.get("updatedAt", "")
        self.raw: dict = data


# Yellow Card disbursement status → FrenzPay TransactionStatus
YC_STATUS_MAP: dict[str, str] = {
    "pending": "PENDING",
    "processing": "PROCESSING",
    "paid": "COMPLETED",
    "failed": "FAILED",
    "expired": "FAILED",
    "refunded": "REVERSED",
}

# Yellow Card payment status → FrenzPay TransactionStatus
YC_PAYMENT_STATUS_MAP: dict[str, str] = {
    "pending": "PENDING",
    "confirming": "PROCESSING",
    "settled": "COMPLETED",
    "failed": "FAILED",
    "expired": "FAILED",
}


def map_yc_disbursement_status(status: str) -> str:
    return YC_STATUS_MAP.get(status.lower(), "PENDING")


def map_yc_payment_status(status: str) -> str:
    return YC_PAYMENT_STATUS_MAP.get(status.lower(), "PENDING")


# ── Main client ───────────────────────────────────────────────────────────────

class YellowCardClient:
    """
    Async Yellow Card API v3 client.

    Requires settings:
      YELLOWCARD_API_KEY    — API key from Yellow Card dashboard
      YELLOWCARD_SECRET_KEY — Signing secret from Yellow Card dashboard
    """

    def _is_configured(self) -> bool:
        return bool(settings.YELLOWCARD_API_KEY and settings.YELLOWCARD_SECRET_KEY)

    # ── Account ───────────────────────────────────────────────────────────────

    async def get_account_details(self) -> dict:
        """GET /business/details — developer account info and balances."""
        if not self._is_configured():
            logger.warning("Yellow Card API not configured")
            return {}
        path = "/business/details"
        async with _client() as c:
            resp = await c.get(path, headers=_headers("GET", path))
            resp.raise_for_status()
            return resp.json()

    # ── Rates ─────────────────────────────────────────────────────────────────

    async def get_rates(
        self,
        country: str | None = None,
        crypto_currency: str = "USDT",
    ) -> list[YCRate]:
        """
        GET /business/rates?country=NG&currency=USDT

        Returns buy/sell rates for the given crypto in a country.
        If country is omitted, returns all countries.
        """
        if not self._is_configured():
            logger.warning("Yellow Card API not configured — skipping rate fetch")
            return []

        params: dict[str, str] = {"currency": crypto_currency.upper()}
        if country:
            params["country"] = country.upper()

        path = "/business/rates"
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        full_path = f"{path}?{qs}"

        async with _client() as c:
            resp = await c.get(full_path, headers=_headers("GET", full_path))
            resp.raise_for_status()
            data = resp.json()
            items = data if isinstance(data, list) else data.get("rates", [])
            return [YCRate(r) for r in items]

    async def get_rate(self, country: str, crypto_currency: str = "USDT") -> YCRate | None:
        """Convenience: get the single rate for a country/crypto pair."""
        rates = await self.get_rates(country=country, crypto_currency=crypto_currency)
        return rates[0] if rates else None

    # ── Channels ──────────────────────────────────────────────────────────────

    async def get_channels(
        self,
        country: str | None = None,
        currency: str | None = None,
    ) -> list[YCChannel]:
        """
        GET /business/channels — list available payment channels.

        country:  "NG" | "GH" | "KE" | "ZA" | "TZ" | "UG" | "ZM" | "CM" | "CI" | "SN"
        currency: "NGN" | "GHS" | "KES" | "ZAR" …
        """
        if not self._is_configured():
            return []

        params: dict[str, str] = {}
        if country:
            params["country"] = country.upper()
        if currency:
            params["currency"] = currency.upper()

        path = "/business/channels"
        if params:
            qs = "&".join(f"{k}={v}" for k, v in params.items())
            full_path = f"{path}?{qs}"
        else:
            full_path = path

        async with _client() as c:
            resp = await c.get(full_path, headers=_headers("GET", full_path))
            resp.raise_for_status()
            data = resp.json()
            items = data if isinstance(data, list) else data.get("channels", [])
            return [YCChannel(ch) for ch in items]

    # ── Payments (inbound: fiat → crypto) ────────────────────────────────────

    async def create_payment(
        self,
        amount: float,
        local_currency: str,
        crypto_currency: str,
        channel_id: str,
        customer: dict,
        sequence_id: str,
        reason: str = "personal",
    ) -> YCPayment:
        """
        POST /business/payments

        Creates a payment request where the customer sends local fiat to
        Yellow Card and FrenzPay receives the equivalent crypto.

        customer dict: { name, country, phone?, email?, accountNumber?, accountName? }
        sequence_id: your idempotency key (FrenzPay transaction reference)
        """
        payload = {
            "amount": amount,
            "currency": local_currency.upper(),
            "cryptoCurrency": crypto_currency.upper(),
            "channelId": channel_id,
            "customer": customer,
            "sequenceId": sequence_id,
            "reason": reason,
        }
        body = json.dumps(payload)
        path = "/business/payments"
        async with _client() as c:
            resp = await c.post(path, content=body, headers=_headers("POST", path, body))
            resp.raise_for_status()
            return YCPayment(resp.json())

    async def get_payment(self, payment_id: str) -> YCPayment:
        """GET /business/payments/{id}"""
        path = f"/business/payments/{payment_id}"
        async with _client() as c:
            resp = await c.get(path, headers=_headers("GET", path))
            resp.raise_for_status()
            return YCPayment(resp.json())

    async def list_payments(
        self,
        page: int = 1,
        page_size: int = 25,
        status: str | None = None,
    ) -> dict[str, Any]:
        """GET /business/payments — offset-paginated."""
        params = {"page": page, "pageSize": page_size}
        if status:
            params["status"] = status  # type: ignore[assignment]

        qs = "&".join(f"{k}={v}" for k, v in params.items())
        path = f"/business/payments?{qs}"
        async with _client() as c:
            resp = await c.get(path, headers=_headers("GET", path))
            resp.raise_for_status()
            data = resp.json()
            items = data if isinstance(data, list) else data.get("payments", data.get("data", []))
            return {"items": [YCPayment(p).__dict__ for p in [YCPayment(p) for p in items]],
                    "total": data.get("total", len(items)), "page": page}

    # ── Disbursements (outbound: crypto → fiat) ───────────────────────────────

    async def create_disbursement(
        self,
        amount: float,
        local_currency: str,
        crypto_currency: str,
        channel_id: str,
        recipient: dict,
        sequence_id: str,
        reason: str = "personal",
    ) -> YCDisbursement:
        """
        POST /business/disbursements

        FrenzPay sends crypto to Yellow Card; Yellow Card pays the recipient
        in local currency via their bank or mobile money account.

        recipient dict:
          For bank: { name, accountNumber, bankCode, country }
          For momo: { name, phoneNumber, country }

        sequence_id: your idempotency key (FrenzPay transaction reference)
        """
        payload = {
            "amount": amount,
            "currency": local_currency.upper(),
            "cryptoCurrency": crypto_currency.upper(),
            "channelId": channel_id,
            "recipient": recipient,
            "sequenceId": sequence_id,
            "reason": reason,
        }
        body = json.dumps(payload)
        path = "/business/disbursements"
        async with _client() as c:
            resp = await c.post(path, content=body, headers=_headers("POST", path, body))
            resp.raise_for_status()
            return YCDisbursement(resp.json())

    async def get_disbursement(self, disbursement_id: str) -> YCDisbursement:
        """GET /business/disbursements/{id}"""
        path = f"/business/disbursements/{disbursement_id}"
        async with _client() as c:
            resp = await c.get(path, headers=_headers("GET", path))
            resp.raise_for_status()
            return YCDisbursement(resp.json())

    async def list_disbursements(
        self,
        page: int = 1,
        page_size: int = 25,
        status: str | None = None,
    ) -> dict[str, Any]:
        """GET /business/disbursements — offset-paginated."""
        params: dict[str, Any] = {"page": page, "pageSize": page_size}
        if status:
            params["status"] = status

        qs = "&".join(f"{k}={v}" for k, v in params.items())
        path = f"/business/disbursements?{qs}"
        async with _client() as c:
            resp = await c.get(path, headers=_headers("GET", path))
            resp.raise_for_status()
            data = resp.json()
            items = data if isinstance(data, list) else data.get("disbursements", data.get("data", []))
            return {"items": [d.__dict__ for d in [YCDisbursement(d) for d in items]],
                    "total": data.get("total", len(items)), "page": page}

    # ── Network / user lookup ─────────────────────────────────────────────────

    async def lookup_account(
        self,
        account_identifier: str,
        channel_id: str,
        country: str,
    ) -> dict:
        """
        POST /business/network

        Resolve a phone number or account number to an account holder name
        before sending a disbursement (name validation / fraud check).
        """
        payload = {
            "accountIdentifier": account_identifier,
            "channelId": channel_id,
            "country": country.upper(),
        }
        body = json.dumps(payload)
        path = "/business/network"
        async with _client() as c:
            resp = await c.post(path, content=body, headers=_headers("POST", path, body))
            resp.raise_for_status()
            return resp.json()

    # ── Crypto withdrawals (send crypto from YC balance to external address) ──

    async def withdraw_crypto(
        self,
        amount: float,
        crypto_currency: str,
        destination_address: str,
        network: str,
        sequence_id: str,
    ) -> dict:
        """
        POST /business/withdrawals

        Withdraw crypto from Yellow Card balance to an external wallet address.
        network: ethereum | tron | solana | base | bsc | polygon
        """
        payload = {
            "amount": amount,
            "cryptoCurrency": crypto_currency.upper(),
            "destinationAddress": destination_address,
            "network": network.lower(),
            "sequenceId": sequence_id,
        }
        body = json.dumps(payload)
        path = "/business/withdrawals"
        async with _client() as c:
            resp = await c.post(path, content=body, headers=_headers("POST", path, body))
            resp.raise_for_status()
            return resp.json()


# ── Webhook verification ───────────────────────────────────────────────────────

def verify_yellowcard_signature(body: bytes, signature: str) -> bool:
    """
    Yellow Card signs webhooks with HMAC-SHA256.
    The signature is in the  "X-YC-Signature"  header.
    Message: raw request body bytes.
    """
    secret = getattr(settings, "YELLOWCARD_WEBHOOK_SECRET", "")
    if not secret:
        logger.warning("YELLOWCARD_WEBHOOK_SECRET not set — skipping verification (dev mode)")
        return True

    expected = hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


# ── Singleton ──────────────────────────────────────────────────────────────────
yellowcard = YellowCardClient()
