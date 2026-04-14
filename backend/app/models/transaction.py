import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as PgEnum, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TransactionType(str, enum.Enum):
    DEPOSIT = "DEPOSIT"
    WITHDRAWAL = "WITHDRAWAL"
    FX_CONVERSION = "FX_CONVERSION"
    INTERNAL_TRANSFER = "INTERNAL_TRANSFER"
    FEE = "FEE"
    REFUND = "REFUND"


class TransactionStatus(str, enum.Enum):
    INITIATED = "INITIATED"
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    REVERSED = "REVERSED"


class BeneficiaryType(str, enum.Enum):
    BANK_ACCOUNT = "BANK_ACCOUNT"
    MOBILE_MONEY = "MOBILE_MONEY"
    STABLECOIN_WALLET = "STABLECOIN_WALLET"


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (Index("ix_transaction_user_created", "user_id", "initiated_at"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    reference: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    type: Mapped[TransactionType] = mapped_column(
        PgEnum(TransactionType, name="transaction_type"), nullable=False
    )
    status: Mapped[TransactionStatus] = mapped_column(
        PgEnum(TransactionStatus, name="transaction_status"),
        default=TransactionStatus.INITIATED,
        nullable=False,
    )
    source_wallet_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wallets.id", ondelete="RESTRICT"),
        nullable=True,
    )
    destination_wallet_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wallets.id", ondelete="RESTRICT"),
        nullable=True,
    )
    source_amount: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    source_currency: Mapped[str] = mapped_column(String(10), nullable=False)
    destination_amount: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    destination_currency: Mapped[str] = mapped_column(String(10), nullable=False)
    exchange_rate: Mapped[float] = mapped_column(Numeric(20, 8), default=1, nullable=False)
    frenzpay_fee: Mapped[float] = mapped_column(Numeric(20, 4), default=0, nullable=False)
    frenzpay_fx_markup: Mapped[float] = mapped_column(Numeric(20, 4), default=0, nullable=False)
    graph_fee: Mapped[float] = mapped_column(Numeric(20, 4), default=0, nullable=False)
    graph_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    initiated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="transactions")
    ledger_entries: Mapped[list["LedgerEntry"]] = relationship(
        "LedgerEntry", back_populates="transaction"
    )


class Beneficiary(Base):
    __tablename__ = "beneficiaries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nickname: Mapped[str | None] = mapped_column(String(100), nullable=True)
    type: Mapped[BeneficiaryType] = mapped_column(
        PgEnum(BeneficiaryType, name="beneficiary_type"), nullable=False
    )
    country: Mapped[str] = mapped_column(String(2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False)
    account_number: Mapped[str | None] = mapped_column(String(255), nullable=True)  # encrypted
    account_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bank_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bank_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    mobile_money_provider: Mapped[str | None] = mapped_column(String(100), nullable=True)
    stablecoin_network: Mapped[str | None] = mapped_column(String(50), nullable=True)
    stablecoin_address: Mapped[str | None] = mapped_column(String(500), nullable=True)  # encrypted
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User")


class FXRate(Base):
    __tablename__ = "fx_rates"
    __table_args__ = (
        Index("ix_fx_rates_pair_expiry", "from_currency", "to_currency", "valid_until"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    from_currency: Mapped[str] = mapped_column(String(10), nullable=False)
    to_currency: Mapped[str] = mapped_column(String(10), nullable=False)
    graph_rate: Mapped[float] = mapped_column(Numeric(20, 8), nullable=False)
    frenzpay_rate: Mapped[float] = mapped_column(Numeric(20, 8), nullable=False)
    markup_bps: Mapped[int] = mapped_column(nullable=False)  # basis points
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
