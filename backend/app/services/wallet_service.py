"""
Wallet service — provisions wallets and virtual accounts when a user's KYC tier is upgraded.

On Tier 1 approval:
  - Create USD, GBP, EUR, NGN wallets
  - Create a Graph customer profile
  - Create virtual accounts on Graph for USD, GBP, EUR

On Tier 2 approval:
  - Add KES, GHS wallets (East + West Africa expansion)
"""

import uuid
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.integrations.graph.client import graph
from app.models.user import User
from app.models.wallet import Currency, Wallet, VirtualAccount, WalletStatus

logger = get_logger(__name__)

# Currencies created per KYC tier
TIER_1_CURRENCIES: list[Currency] = [Currency.USD, Currency.GBP, Currency.EUR, Currency.NGN]
TIER_2_CURRENCIES: list[Currency] = [Currency.KES, Currency.GHS]

# Virtual accounts are only provided for hard-currency wallets
VIRTUAL_ACCOUNT_CURRENCIES: set[str] = {"USD", "GBP", "EUR"}


async def provision_tier1_wallets(user: User, db: AsyncSession) -> list[Wallet]:
    """
    Called after KYC Tier 1 is approved.
    Creates wallets + Graph customer + virtual accounts.
    Safe to call multiple times (idempotent — skips existing wallets).
    """
    wallets = await _ensure_wallets(user.id, TIER_1_CURRENCIES, db)
    await db.flush()

    # Create Graph customer profile if not already done
    graph_customer_id = await _ensure_graph_customer(user, wallets, db)

    # Provision virtual accounts for hard-currency wallets
    if graph_customer_id:
        for wallet in wallets:
            if wallet.currency.value in VIRTUAL_ACCOUNT_CURRENCIES:
                await _ensure_virtual_account(wallet, graph_customer_id, db)

    logger.info(f"Tier 1 wallets provisioned for user {user.id}")
    return wallets


async def provision_tier2_wallets(user: User, db: AsyncSession) -> list[Wallet]:
    """
    Called after KYC Tier 2 is approved.
    Adds African currency wallets.
    """
    wallets = await _ensure_wallets(user.id, TIER_2_CURRENCIES, db)
    await db.flush()
    logger.info(f"Tier 2 wallets provisioned for user {user.id}")
    return wallets


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _ensure_wallets(
    user_id: uuid.UUID, currencies: list[Currency], db: AsyncSession
) -> list[Wallet]:
    """Create wallets that don't exist yet. Returns all wallets for these currencies."""
    existing = (
        await db.execute(
            select(Wallet).where(
                Wallet.user_id == user_id,
                Wallet.currency.in_(currencies),
            )
        )
    ).scalars().all()

    existing_currencies = {w.currency for w in existing}
    new_wallets = []

    for currency in currencies:
        if currency not in existing_currencies:
            wallet = Wallet(
                user_id=user_id,
                currency=currency,
                balance=0,
                available_balance=0,
                held_balance=0,
                status=WalletStatus.ACTIVE,
            )
            db.add(wallet)
            new_wallets.append(wallet)

    return list(existing) + new_wallets


async def _ensure_graph_customer(
    user: User, wallets: list[Wallet], db: AsyncSession
) -> str | None:
    """
    Create a Graph customer if none of the wallets have a graph_account_id set.
    Returns the Graph customer ID.
    """
    # Check if any wallet already has a graph_account_id
    for wallet in wallets:
        if wallet.graph_account_id:
            return wallet.graph_account_id

    # Create new Graph customer
    try:
        customer = await graph.create_customer({
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "phone": user.phone,
            "country": user.country,
        })
        # Store the customer ID on all wallets
        for wallet in wallets:
            wallet.graph_account_id = customer.id
        logger.info(f"Graph customer created: {customer.id} for user {user.id}")
        return customer.id
    except Exception as exc:
        logger.error(f"Failed to create Graph customer for {user.id}: {exc}")
        return None


async def _ensure_virtual_account(
    wallet: Wallet, graph_customer_id: str, db: AsyncSession
) -> VirtualAccount | None:
    """Create a virtual account for a wallet if one doesn't exist."""
    # Check if already provisioned
    existing = (
        await db.execute(
            select(VirtualAccount).where(VirtualAccount.wallet_id == wallet.id).limit(1)
        )
    ).scalar_one_or_none()
    if existing:
        return existing

    try:
        va_data = await graph.create_virtual_account(graph_customer_id, wallet.currency.value)
        va = VirtualAccount(
            wallet_id=wallet.id,
            account_number=va_data.account_number,
            routing_number=va_data.routing_number,
            iban=va_data.iban,
            bank_name=va_data.bank_name,
            account_name=va_data.account_name,
            provider="GRAPH",
            provider_reference=va_data.id,
        )
        db.add(va)
        logger.info(f"Virtual account provisioned: {va_data.id} for wallet {wallet.id}")
        return va
    except Exception as exc:
        logger.error(f"Failed to create virtual account for wallet {wallet.id}: {exc}")
        return None
