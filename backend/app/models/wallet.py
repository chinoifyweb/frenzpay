import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as PgEnum, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class WalletStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    FROZEN = "FROZEN"
    CLOSED = "CLOSED"


class Currency(str, enum.Enum):
    USD = "USD"
    GBP = "GBP"
    EUR = "EUR"
    NGN = "NGN"
    KES = "KES"
    GHS = "GHS"
    XAF = "XAF"
    XOF = "XOF"


class Wallet(Base):
    __tablename__ = "wallets"
    __table_args__ = (UniqueConstraint("user_id", "currency", name="uq_wallet_user_currency"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    currency: Mapped[Currency] = mapped_column(
        PgEnum(Currency, name="currency"), nullable=False
    )
    # Balances stored with 4 decimal places for precision
    balance: Mapped[float] = mapped_column(Numeric(20, 4), default=0, nullable=False)
    available_balance: Mapped[float] = mapped_column(Numeric(20, 4), default=0, nullable=False)
    held_balance: Mapped[float] = mapped_column(Numeric(20, 4), default=0, nullable=False)
    graph_account_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[WalletStatus] = mapped_column(
        PgEnum(WalletStatus, name="wallet_status"), default=WalletStatus.ACTIVE, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="wallets")
    virtual_accounts: Mapped[list["VirtualAccount"]] = relationship(
        "VirtualAccount", back_populates="wallet", cascade="all, delete-orphan"
    )
    ledger_entries: Mapped[list["LedgerEntry"]] = relationship(
        "LedgerEntry", back_populates="wallet"
    )


class VirtualAccount(Base):
    __tablename__ = "virtual_accounts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    wallet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wallets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    account_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    routing_number: Mapped[str | None] = mapped_column(String(50), nullable=True)  # USD
    iban: Mapped[str | None] = mapped_column(String(50), nullable=True)  # EUR/GBP
    bank_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    account_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider: Mapped[str] = mapped_column(String(50), default="GRAPH", nullable=False)
    provider_reference: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    wallet: Mapped["Wallet"] = relationship("Wallet", back_populates="virtual_accounts")
