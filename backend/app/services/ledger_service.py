"""
Double-entry ledger engine.
Every transaction MUST create exactly two ledger entries: one DEBIT and one CREDIT.
sum(debits) == sum(credits) always — this invariant is enforced here.
"""

from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ledger import EntryType, LedgerEntry
from app.models.transaction import Transaction
from app.models.wallet import Wallet


async def post_journal_entry(
    db: AsyncSession,
    transaction: Transaction,
    debit_wallet: Wallet,
    credit_wallet: Wallet,
    amount: Decimal,
    currency: str,
    description: str = "",
) -> tuple[LedgerEntry, LedgerEntry]:
    """
    Creates a balanced debit/credit pair.
    Returns (debit_entry, credit_entry).
    """
    debit_balance_after = Decimal(str(debit_wallet.balance)) - amount
    credit_balance_after = Decimal(str(credit_wallet.balance)) + amount

    debit_entry = LedgerEntry(
        transaction_id=transaction.id,
        wallet_id=debit_wallet.id,
        entry_type=EntryType.DEBIT,
        amount=amount,
        currency=currency,
        balance_after=debit_balance_after,
        description=description,
    )
    credit_entry = LedgerEntry(
        transaction_id=transaction.id,
        wallet_id=credit_wallet.id,
        entry_type=EntryType.CREDIT,
        amount=amount,
        currency=currency,
        balance_after=credit_balance_after,
        description=description,
    )

    db.add(debit_entry)
    db.add(credit_entry)

    # Update in-memory balances (SQLAlchemy will flush to DB on commit)
    debit_wallet.balance = float(debit_balance_after)
    debit_wallet.available_balance = float(
        Decimal(str(debit_wallet.available_balance)) - amount
    )
    credit_wallet.balance = float(credit_balance_after)
    credit_wallet.available_balance = float(
        Decimal(str(credit_wallet.available_balance)) + amount
    )

    return debit_entry, credit_entry


async def place_hold(wallet: Wallet, amount: Decimal, db: AsyncSession) -> None:
    """
    Moves funds from available_balance to held_balance (pending outgoing tx).
    Does NOT create ledger entries — hold is a reservation, not a transfer.
    """
    avail = Decimal(str(wallet.available_balance))
    if avail < amount:
        from app.core.exceptions import InsufficientFunds
        raise InsufficientFunds()

    wallet.available_balance = float(avail - amount)
    wallet.held_balance = float(Decimal(str(wallet.held_balance)) + amount)


async def release_hold(wallet: Wallet, amount: Decimal, db: AsyncSession) -> None:
    """Releases a previously placed hold back to available_balance."""
    wallet.available_balance = float(Decimal(str(wallet.available_balance)) + amount)
    wallet.held_balance = float(Decimal(str(wallet.held_balance)) - amount)
