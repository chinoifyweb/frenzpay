"""
Graph API client — payment rails for FrenzPay.
All outbound money-moving calls MUST include an idempotency_key.
"""

import httpx

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_BASE_URL = settings.GRAPH_API_URL


class GraphCustomer:
    def __init__(self, data: dict):
        self.id: str = data["id"]
        self.raw: dict = data


class VirtualAccount:
    def __init__(self, data: dict):
        self.id: str = data["id"]
        self.account_number: str = data.get("account_number", "")
        self.routing_number: str = data.get("routing_number", "")
        self.iban: str = data.get("iban", "")
        self.bank_name: str = data.get("bank_name", "")
        self.account_name: str = data.get("account_name", "")
        self.raw: dict = data


class FXQuote:
    def __init__(self, data: dict):
        self.id: str = data["id"]
        self.from_currency: str = data["from_currency"]
        self.to_currency: str = data["to_currency"]
        self.rate: float = data["rate"]
        self.expires_at: str = data["expires_at"]
        self.raw: dict = data


class GraphClient:
    def __init__(self) -> None:
        self._api_key = settings.GRAPH_API_KEY

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    async def create_customer(self, user_data: dict) -> GraphCustomer:
        async with httpx.AsyncClient(base_url=_BASE_URL, timeout=30) as client:
            resp = await client.post(
                "/v1/customers",
                json=user_data,
                headers=self._headers(),
            )
            resp.raise_for_status()
            return GraphCustomer(resp.json())

    async def create_virtual_account(self, customer_id: str, currency: str) -> VirtualAccount:
        async with httpx.AsyncClient(base_url=_BASE_URL, timeout=30) as client:
            resp = await client.post(
                "/v1/virtual-accounts",
                json={"customer_id": customer_id, "currency": currency},
                headers=self._headers(),
            )
            resp.raise_for_status()
            return VirtualAccount(resp.json())

    async def initiate_payout(
        self,
        customer_id: str,
        amount: float,
        currency: str,
        beneficiary: dict,
        idempotency_key: str,  # CRITICAL — prevents double-sends on retry
    ) -> dict:
        async with httpx.AsyncClient(base_url=_BASE_URL, timeout=30) as client:
            resp = await client.post(
                "/v1/payouts",
                json={
                    "customer_id": customer_id,
                    "amount": amount,
                    "currency": currency,
                    "beneficiary": beneficiary,
                },
                headers={**self._headers(), "Idempotency-Key": idempotency_key},
            )
            resp.raise_for_status()
            return resp.json()

    async def get_fx_quote(self, from_ccy: str, to_ccy: str, amount: float) -> FXQuote:
        async with httpx.AsyncClient(base_url=_BASE_URL, timeout=30) as client:
            resp = await client.post(
                "/v1/fx/quotes",
                json={"from_currency": from_ccy, "to_currency": to_ccy, "amount": amount},
                headers=self._headers(),
            )
            resp.raise_for_status()
            return FXQuote(resp.json())

    async def execute_fx(self, quote_id: str, idempotency_key: str) -> dict:
        async with httpx.AsyncClient(base_url=_BASE_URL, timeout=30) as client:
            resp = await client.post(
                f"/v1/fx/quotes/{quote_id}/execute",
                headers={**self._headers(), "Idempotency-Key": idempotency_key},
            )
            resp.raise_for_status()
            return resp.json()

    async def get_balance(self, currency: str) -> float:
        """Used by the daily reconciliation job."""
        async with httpx.AsyncClient(base_url=_BASE_URL, timeout=30) as client:
            resp = await client.get(
                f"/v1/balances/{currency}",
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json()["balance"]


graph = GraphClient()
