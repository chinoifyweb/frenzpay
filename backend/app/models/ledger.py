import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Enum as PgEnum, ForeignKey, Index, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class EntryType(str, enum.Enum):
    DEBIT = "DEBIT"
    CREDIT = "CREDIT"


class LedgerEntry(Base):
    """
    Double-entry ledger — every transaction produces exactly two entries:
    one DEBIT and one CREDIT. sum(debits) must always equal sum(credits).
    balance_after is a snapshot for audit purposes.
    """

    __tablename__ = "ledger_entries"
    __table_args__ = (Index("ix_ledger_wallet_created", "wallet_id", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    wallet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wallets.id", ondelete="RESTRICT"),
        nullable=False,
    )
    entry_type: Mapped[EntryType] = mapped_column(
        PgEnum(EntryType, name="entry_type"), nullable=False
    )
    amount: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False)
    balance_after: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    wallet: Mapped["Wallet"] = relationship("Wallet", back_populates="ledger_entries")
    transaction: Mapped["Transaction"] = relationship("Transaction", back_populates="ledger_entries")
