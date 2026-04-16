"""
Bridge API client — payment rails for FrenzPay.
https://apidocs.bridge.xyz

Bridge provides:
  - Customers (KYC profiles & endorsements)
  - Virtual accounts (receive USD/EUR/GBP/MXN/BRL via bank transfer)
  - External accounts (save customer bank accounts for payouts)
  - Transfers (send to bank accounts or crypto wallets, auto-FX)
  - Exchange rates (midmarket / buy / sell)
  - Liquidation addresses (crypto → fiat pipeline)
  - Bridge wallets (custodial USDC/USDT wallets on Base/Ethereum/Solana)
  - KYC links (hosted identity verification)

Auth:       Api-Key header
Idempotency: Idempotency-Key header on all money-moving calls
Pagination:  cursor-based — "starting_after" / "ending_before" with "count" + "data"
"""

from __future__ import annotations

import httpx

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _base_url() -> str:
    return settings.BRIDGE_API_URL  # re-read each call so hot-reload works


def _headers(idempotency_key: str | None = None) -> dict[str, str]:
    h = {
        "Api-Key": settings.BRIDGE_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if idempotency_key:
        h["Idempotency-Key"] = idempotency_key
    return h


def _client(timeout: int = 30) -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=_base_url(), timeout=timeout)


# ── Response types ─────────────────────────────────────────────────────────────

class BridgeCustomer:
    """
    Represents a Bridge customer record.

    status values: active | rejected | incomplete | under_review | offboarded
    kyc_status values: approved | rejected | not_started | under_review | pending_review
    """
    def __init__(self, data: dict):
        self.id: str = data["id"]
        self.status: str = data.get("status", "")
        self.kyc_status: str = data.get("kyc_status", "")
        self.email: str = data.get("email", "")
        self.created_at: str = data.get("created_at", "")
        self.raw: dict = data


class VirtualAccount:
    """
    Bridge virtual account — receives inbound bank transfers.

    currency: usd | eur | gbp | mxn | brl
    """
    def __init__(self, data: dict):
        self.id: str = data["id"]
        self.account_name: str = data.get("account_owner_name", "")
        self.currency: str = data.get("currency", "").upper()
        self.status: str = data.get("status", "")
        # USD ACH
        self.account_number: str = data.get("account_number", "")
        self.routing_number: str = data.get("routing_number", "")
        # EUR SEPA / GBP Faster Payments
        self.iban: str = data.get("iban", "")
        self.bic: str = data.get("bic", "")
        self.sort_code: str = data.get("sort_code", "")
        self.bank_name: str = data.get("bank_name", "")
        self.bank_address: dict = data.get("bank_address", {})
        self.raw: dict = data


class ExchangeRate:
    """
    Bridge exchange rate snapshot.
    GET /v0/exchange_rates?from_currency=USD&to_currency=EUR
    """
    def __init__(self, data: dict):
        self.from_currency: str = data.get("from_currency", "").upper()
        self.to_currency: str = data.get("to_currency", "").upper()
        self.midmarket_rate: float = float(data.get("exchange_rate", data.get("midmarket_rate", 1.0)))
        # Bridge returns a single rate under "exchange_rate"; buy/sell are derived
        self.buy_rate: float = float(data.get("buy_rate", self.midmarket_rate))
        self.sell_rate: float = float(data.get("sell_rate", self.midmarket_rate))
        self.updated_at: str = data.get("updated_at", "")
        self.raw: dict = data


class KYCLink:
    """Bridge-hosted KYC verification link."""
    def __init__(self, data: dict):
        self.id: str = data["id"]
        self.url: str = data.get("url", "")
        self.kyc_status: str = data.get("kyc_status", "not_started")
        self.type: str = data.get("type", "individual")
        self.expires_at: str = data.get("expires_at", "")
        self.customer_id: str | None = data.get("customer_id")
        self.raw: dict = data


class PaginatedList:
    """Cursor-paginated list from Bridge."""
    def __init__(self, data: dict):
        self.count: int = data.get("count", 0)
        self.data: list[dict] = data.get("data", [])
        # last item's id can be used as starting_after for next page
        self.has_more: bool = self.count == len(self.data) and self.count > 0

    def next_cursor(self) -> str | None:
        return self.data[-1]["id"] if self.data else None


# Legacy alias kept for transaction_service.py compatibility
class FXQuote:
    def __init__(self, from_ccy: str, to_ccy: str, rate: float):
        self.id: str = ""          # Bridge has no persistent quote IDs
        self.from_currency: str = from_ccy
        self.to_currency: str = to_ccy
        self.rate: float = rate
        self.expires_at: str = ""
        self.raw: dict = {}


# ── Bridge Transfer States (complete state machine) ───────────────────────────

BRIDGE_TRANSFER_STATE_MAP: dict[str, str] = {
    "awaiting_funds": "PENDING",
    "funds_received": "PENDING",
    "payment_submitted": "PROCESSING",
    "payment_processed": "COMPLETED",
    "in_review": "PENDING",
    "kyc_required": "PENDING",
    "canceled": "FAILED",
    "error": "FAILED",
    "returned": "REVERSED",
    "refund_in_flight": "REVERSED",
    "refunded": "REVERSED",
    "undeliverable": "FAILED",
}


def map_bridge_state(bridge_state: str) -> str:
    """Map a Bridge transfer state to FrenzPay TransactionStatus string."""
    return BRIDGE_TRANSFER_STATE_MAP.get(bridge_state.lower(), "PENDING")


# ── Destination builder ───────────────────────────────────────────────────────

def _build_destination(b: dict) -> dict:
    """
    Convert a FrenzPay beneficiary dict → Bridge destination object.

    Bridge destination shape:
      { payment_rail, currency, external_account: {...} }   # bank
      { payment_rail, currency, to_address }                # crypto
    """
    btype = b.get("type", "BANK_ACCOUNT").upper()

    # ── Crypto / stablecoin ─────────────────────────────────────────────────
    if btype == "STABLECOIN_WALLET":
        network = b.get("stablecoin_network", "ethereum").lower()
        rail_map = {
            "solana": "solana",
            "ethereum": "ethereum",
            "base": "base",
            "tron": "tron",
            "polygon": "polygon",
        }
        return {
            "payment_rail": rail_map.get(network, "ethereum"),
            "currency": b.get("currency", "usdc").lower(),
            "to_address": b.get("stablecoin_address", ""),
        }

    # ── Mobile money ────────────────────────────────────────────────────────
    if btype == "MOBILE_MONEY":
        return {
            "payment_rail": "mobile_money",
            "currency": b.get("currency", "").lower(),
            "mobile_number": b.get("account_number", ""),
            "mobile_money_provider": b.get("mobile_money_provider", ""),
        }

    # ── Bank account (default) ───────────────────────────────────────────────
    currency = b.get("currency", "usd").lower()
    country = b.get("country", "US").upper()

    if currency == "usd":
        rail = "ach"
    elif currency == "eur":
        rail = "sepa"
    elif currency == "gbp":
        rail = "faster_payments"
    else:
        rail = "wire"  # fallback for exotic currencies

    ext_account: dict = {
        "account_holder_name": b.get("account_name", ""),
        "account_number": b.get("account_number", ""),
        "account_type": b.get("account_type", "checking"),
        "bank_name": b.get("bank_name", ""),
        "country": country,
        "currency": currency,
    }

    if routing := b.get("bank_code") or b.get("routing_number"):
        ext_account["routing_number"] = routing

    if iban := b.get("iban"):
        ext_account["iban"] = iban
        rail = "sepa"

    if sort_code := b.get("sort_code"):
        ext_account["sort_code"] = sort_code
        rail = "faster_payments"

    return {
        "payment_rail": rail,
        "currency": currency,
        "external_account": ext_account,
    }


def _build_source(currency: str, payment_rail: str | None = None) -> dict:
    """
    Build a Bridge source object.
    For stablecoin-funded payouts the source is the Bridge developer wallet;
    for received-fiat payouts the source is the customer's virtual account balance.
    """
    ccy = currency.lower()
    if payment_rail:
        return {"payment_rail": payment_rail, "currency": ccy}
    # Pick sensible default rail per currency
    if ccy == "usd":
        return {"payment_rail": "ach", "currency": ccy}
    if ccy == "eur":
        return {"payment_rail": "sepa", "currency": ccy}
    if ccy == "gbp":
        return {"payment_rail": "faster_payments", "currency": ccy}
    if ccy in ("usdc", "usdt"):
        return {"payment_rail": "base", "currency": ccy}
    return {"payment_rail": "wire", "currency": ccy}


# ── Main client ───────────────────────────────────────────────────────────────

class BridgeClient:
    """
    Async Bridge API client.

    All mutating calls accept an idempotency_key so retries are safe.
    All list calls support cursor-based pagination (starting_after / ending_before).
    """

    # ── Customers ─────────────────────────────────────────────────────────────

    async def create_customer(self, user_data: dict) -> BridgeCustomer:
        """
        POST /v0/customers
        Creates a Bridge customer profile (required before any money movement).

        user_data keys: first_name, last_name, email, phone, country,
                        address (dict with street/city/state/postal_code/country)
        """
        payload: dict = {
            "type": "individual",
            "first_name": user_data["first_name"],
            "last_name": user_data["last_name"],
            "email": user_data["email"],
        }
        if phone := user_data.get("phone"):
            payload["phone"] = phone
        if address := user_data.get("address"):
            payload["address"] = address
        elif country := user_data.get("country"):
            payload["address"] = {"country": country}

        async with _client() as c:
            resp = await c.post("/v0/customers", json=payload, headers=_headers())
            resp.raise_for_status()
            return BridgeCustomer(resp.json())

    async def get_customer(self, customer_id: str) -> BridgeCustomer:
        """GET /v0/customers/{id}"""
        async with _client() as c:
            resp = await c.get(f"/v0/customers/{customer_id}", headers=_headers())
            resp.raise_for_status()
            return BridgeCustomer(resp.json())

    async def update_customer(self, customer_id: str, updates: dict) -> BridgeCustomer:
        """PUT /v0/customers/{id}"""
        async with _client() as c:
            resp = await c.put(
                f"/v0/customers/{customer_id}", json=updates, headers=_headers()
            )
            resp.raise_for_status()
            return BridgeCustomer(resp.json())

    # ── KYC Links ─────────────────────────────────────────────────────────────

    async def create_kyc_link(
        self,
        customer_id: str,
        kyc_type: str = "individual",
        redirect_uri: str | None = None,
    ) -> KYCLink:
        """
        POST /v0/kyc_links
        Creates a Bridge-hosted KYC URL that the user visits to complete identity
        verification. Once approved, the customer's kyc_status becomes "approved".
        """
        payload: dict = {
            "customer_id": customer_id,
            "type": kyc_type,
        }
        if redirect_uri:
            payload["redirect_uri"] = redirect_uri

        async with _client() as c:
            resp = await c.post("/v0/kyc_links", json=payload, headers=_headers())
            resp.raise_for_status()
            return KYCLink(resp.json())

    async def get_kyc_link(self, link_id: str) -> KYCLink:
        """GET /v0/kyc_links/{id}"""
        async with _client() as c:
            resp = await c.get(f"/v0/kyc_links/{link_id}", headers=_headers())
            resp.raise_for_status()
            return KYCLink(resp.json())

    # ── Virtual Accounts ──────────────────────────────────────────────────────

    async def list_virtual_accounts(
        self, customer_id: str, starting_after: str | None = None, limit: int = 25
    ) -> PaginatedList:
        """GET /v0/customers/{id}/virtual_accounts — cursor-paginated"""
        params: dict = {"limit": limit}
        if starting_after:
            params["starting_after"] = starting_after

        async with _client() as c:
            resp = await c.get(
                f"/v0/customers/{customer_id}/virtual_accounts",
                params=params,
                headers=_headers(),
            )
            resp.raise_for_status()
            return PaginatedList(resp.json())

    async def create_virtual_account(
        self, customer_id: str, currency: str
    ) -> VirtualAccount:
        """
        POST /v0/customers/{id}/virtual_accounts
        currency: usd | eur | gbp | mxn | brl
        """
        async with _client() as c:
            resp = await c.post(
                f"/v0/customers/{customer_id}/virtual_accounts",
                json={"currency": currency.lower()},
                headers=_headers(),
            )
            resp.raise_for_status()
            return VirtualAccount(resp.json())

    # ── External Accounts (saved beneficiary bank accounts) ───────────────────

    async def list_external_accounts(
        self, customer_id: str, starting_after: str | None = None, limit: int = 25
    ) -> PaginatedList:
        """GET /v0/customers/{id}/external_accounts"""
        params: dict = {"limit": limit}
        if starting_after:
            params["starting_after"] = starting_after

        async with _client() as c:
            resp = await c.get(
                f"/v0/customers/{customer_id}/external_accounts",
                params=params,
                headers=_headers(),
            )
            resp.raise_for_status()
            return PaginatedList(resp.json())

    async def create_external_account(
        self, customer_id: str, account_data: dict, idempotency_key: str | None = None
    ) -> dict:
        """
        POST /v0/customers/{id}/external_accounts

        account_data for US ACH:
            { account_holder_name, account_number, routing_number, account_type,
              account_owner_type, first_name, last_name, business_name }

        account_data for SEPA:
            { account_holder_name, iban, bic, account_owner_type, country }

        account_data for Faster Payments:
            { account_holder_name, sort_code, account_number, account_owner_type }
        """
        async with _client() as c:
            resp = await c.post(
                f"/v0/customers/{customer_id}/external_accounts",
                json=account_data,
                headers=_headers(idempotency_key),
            )
            resp.raise_for_status()
            return resp.json()

    async def delete_external_account(self, customer_id: str, account_id: str) -> None:
        """DELETE /v0/customers/{id}/external_accounts/{account_id}"""
        async with _client() as c:
            resp = await c.delete(
                f"/v0/customers/{customer_id}/external_accounts/{account_id}",
                headers=_headers(),
            )
            resp.raise_for_status()

    # ── Exchange Rates ─────────────────────────────────────────────────────────

    async def get_exchange_rate(self, from_currency: str, to_currency: str) -> ExchangeRate:
        """
        GET /v0/exchange_rates?from_currency=USD&to_currency=EUR

        Returns midmarket rate. FrenzPay applies its own markup on top.
        """
        async with _client() as c:
            resp = await c.get(
                "/v0/exchange_rates",
                params={
                    "from_currency": from_currency.lower(),
                    "to_currency": to_currency.lower(),
                },
                headers=_headers(),
            )
            resp.raise_for_status()
            return ExchangeRate(resp.json())

    # Legacy alias — transaction_service.py calls get_fx_quote
    async def get_fx_quote(self, from_ccy: str, to_ccy: str, amount: float) -> FXQuote:
        """
        Backward-compat wrapper around get_exchange_rate.
        Returns an FXQuote with the midmarket rate.
        """
        rate = await self.get_exchange_rate(from_ccy, to_ccy)
        return FXQuote(from_ccy=rate.from_currency, to_ccy=rate.to_currency, rate=rate.midmarket_rate)

    # ── Transfers ─────────────────────────────────────────────────────────────

    async def list_transfers(
        self,
        on_behalf_of: str | None = None,
        starting_after: str | None = None,
        ending_before: str | None = None,
        limit: int = 25,
    ) -> PaginatedList:
        """
        GET /v0/transfers — cursor-paginated

        Cursor pagination:
          - Next page:  starting_after=<last_item_id>
          - Prev page:  ending_before=<first_item_id>
        """
        params: dict = {"limit": limit}
        if on_behalf_of:
            params["on_behalf_of"] = on_behalf_of
        if starting_after:
            params["starting_after"] = starting_after
        if ending_before:
            params["ending_before"] = ending_before

        async with _client() as c:
            resp = await c.get("/v0/transfers", params=params, headers=_headers())
            resp.raise_for_status()
            return PaginatedList(resp.json())

    async def create_transfer(self, payload: dict, idempotency_key: str) -> dict:
        """
        POST /v0/transfers

        Minimum payload:
        {
          "on_behalf_of": "<customer_id>",
          "source": { "payment_rail": "ach", "currency": "usd" },
          "destination": {
              "payment_rail": "sepa",
              "currency": "eur",
              "external_account": { ... }
          },
          "amount": "100.00"
        }

        Optional:
          "developer_fee_percent": "0.5"   # add fee on top of Bridge fees
        """
        async with _client() as c:
            resp = await c.post(
                "/v0/transfers", json=payload, headers=_headers(idempotency_key)
            )
            resp.raise_for_status()
            return resp.json()

    async def get_transfer(self, transfer_id: str) -> dict:
        """GET /v0/transfers/{id}"""
        async with _client() as c:
            resp = await c.get(f"/v0/transfers/{transfer_id}", headers=_headers())
            resp.raise_for_status()
            return resp.json()

    async def initiate_payout(
        self,
        customer_id: str,
        amount: float,
        currency: str,
        beneficiary: dict,
        idempotency_key: str,
        source_payment_rail: str | None = None,
    ) -> dict:
        """
        High-level helper: create a payout transfer for a FrenzPay beneficiary.

        currency: source currency (usd | eur | gbp | usdc | usdt …)
        beneficiary: FrenzPay Beneficiary dict with type/account_number/etc.
        """
        payload = {
            "on_behalf_of": customer_id,
            "amount": f"{amount:.8f}".rstrip("0").rstrip("."),
            "source": _build_source(currency, source_payment_rail),
            "destination": _build_destination(beneficiary),
            "developer_fee_percent": "0",  # FrenzPay takes fee in its own ledger
        }
        return await self.create_transfer(payload, idempotency_key)

    async def convert_currencies(
        self,
        customer_id: str,
        source_currency: str,
        destination_currency: str,
        amount: float,
        dest_external_account: dict | None = None,
        dest_address: str | None = None,
        idempotency_key: str = "",
    ) -> dict:
        """
        FX conversion transfer.

        For wallet-to-wallet conversion within FrenzPay, specify dest_address
        (Bridge wallet address). For fiat payout, specify dest_external_account.
        """
        destination: dict = {
            "currency": destination_currency.lower(),
        }

        if dest_address:
            destination["payment_rail"] = _CRYPTO_RAIL.get(destination_currency.lower(), "ethereum")
            destination["to_address"] = dest_address
        elif dest_external_account:
            destination.update(_build_destination({**dest_external_account, "currency": destination_currency}))
        else:
            # Default: destination is the developer's Bridge wallet
            destination["payment_rail"] = "balance"

        payload = {
            "on_behalf_of": customer_id,
            "amount": f"{amount:.8f}".rstrip("0").rstrip("."),
            "source": _build_source(source_currency),
            "destination": destination,
        }
        return await self.create_transfer(payload, idempotency_key)

    # Legacy alias — transaction_service.py calls execute_fx(quote_id, idempotency_key)
    # Since Bridge doesn't have locked FX quotes, the actual conversion is stored in FrenzPay DB;
    # here we just acknowledge the call. The real conversion should use convert_currencies().
    async def execute_fx(self, quote_id: str, idempotency_key: str) -> dict:
        """
        Legacy stub: Bridge doesn't have a quote-lock mechanism.
        The calling service uses FrenzPay's stored FXRate record as the quote;
        the actual Bridge transfer is created by convert_currencies().
        Returns a stub so transaction_service.py doesn't break.
        """
        logger.debug("execute_fx called (Bridge doesn't have locked quotes; using stored rate)")
        return {"id": quote_id, "status": "pending", "note": "bridge_no_locked_quote"}

    # ── Liquidation Addresses (crypto → fiat) ─────────────────────────────────

    async def list_liquidation_addresses(
        self, customer_id: str, starting_after: str | None = None, limit: int = 25
    ) -> PaginatedList:
        """GET /v0/customers/{id}/liquidation_addresses"""
        params: dict = {"limit": limit}
        if starting_after:
            params["starting_after"] = starting_after

        async with _client() as c:
            resp = await c.get(
                f"/v0/customers/{customer_id}/liquidation_addresses",
                params=params,
                headers=_headers(),
            )
            resp.raise_for_status()
            return PaginatedList(resp.json())

    async def create_liquidation_address(
        self,
        customer_id: str,
        chain: str,
        currency: str,
        destination_payment_rail: str,
        destination_currency: str,
        destination_address: str | None = None,
        external_account_id: str | None = None,
    ) -> dict:
        """
        POST /v0/customers/{id}/liquidation_addresses

        A liquidation address is a crypto address owned by Bridge that, when
        it receives crypto, automatically converts it to fiat and sends to the
        customer's bank account or another address.

        chain:    base | ethereum | solana | tron | polygon
        currency: usdc | usdt
        destination_payment_rail: ach | sepa | faster_payments | wire
        destination_currency:     usd | eur | gbp | ngn …
        """
        payload: dict = {
            "chain": chain.lower(),
            "currency": currency.lower(),
            "destination": {
                "payment_rail": destination_payment_rail.lower(),
                "currency": destination_currency.lower(),
            },
        }
        if destination_address:
            payload["destination"]["to_address"] = destination_address
        if external_account_id:
            payload["destination"]["external_account_id"] = external_account_id

        async with _client() as c:
            resp = await c.post(
                f"/v0/customers/{customer_id}/liquidation_addresses",
                json=payload,
                headers=_headers(),
            )
            resp.raise_for_status()
            return resp.json()

    # ── Bridge Wallets (custodial crypto) ─────────────────────────────────────

    async def list_wallets(
        self,
        customer_id: str | None = None,
        starting_after: str | None = None,
        limit: int = 25,
    ) -> PaginatedList:
        """GET /v0/wallets — cursor-paginated. Filter by customer with on_behalf_of."""
        params: dict = {"limit": limit}
        if customer_id:
            params["on_behalf_of"] = customer_id
        if starting_after:
            params["starting_after"] = starting_after

        async with _client() as c:
            resp = await c.get("/v0/wallets", params=params, headers=_headers())
            resp.raise_for_status()
            return PaginatedList(resp.json())

    async def create_wallet(
        self,
        customer_id: str,
        chain: str,
        currency: str = "usdc",
        idempotency_key: str | None = None,
    ) -> dict:
        """
        POST /v0/wallets

        chain:    base | ethereum | solana | tron | polygon
        currency: usdc | usdt
        """
        payload = {
            "on_behalf_of": customer_id,
            "chain": chain.lower(),
            "currency": currency.lower(),
        }
        async with _client() as c:
            resp = await c.post(
                "/v0/wallets", json=payload, headers=_headers(idempotency_key)
            )
            resp.raise_for_status()
            return resp.json()

    async def get_wallet(self, wallet_id: str) -> dict:
        """GET /v0/wallets/{id}"""
        async with _client() as c:
            resp = await c.get(f"/v0/wallets/{wallet_id}", headers=_headers())
            resp.raise_for_status()
            return resp.json()

    # ── Developer Balances ────────────────────────────────────────────────────

    async def get_balance(self, currency: str) -> float:
        """
        GET /v0/developer/balances/{currency}
        Returns Bridge's developer-level balance for daily reconciliation.
        """
        async with _client() as c:
            resp = await c.get(
                f"/v0/developer/balances/{currency.lower()}",
                headers=_headers(),
            )
            resp.raise_for_status()
            data = resp.json()
            return float(data.get("available_amount", data.get("balance", 0)))


# ── Mapping helper ─────────────────────────────────────────────────────────────

_CRYPTO_RAIL: dict[str, str] = {
    "usdc": "base",
    "usdt": "ethereum",
    "eth": "ethereum",
    "sol": "solana",
    "matic": "polygon",
    "trx": "tron",
}

# ── Singletons ─────────────────────────────────────────────────────────────────

graph = BridgeClient()   # kept as "graph" so existing imports don't break
bridge = graph           # canonical alias
