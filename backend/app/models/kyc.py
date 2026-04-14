import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as PgEnum, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class KYCSubmissionStatus(str, enum.Enum):
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class KYCProvider(str, enum.Enum):
    DOJAH = "DOJAH"
    SMILE_ID = "SMILE_ID"
    MANUAL = "MANUAL"


class KYCTierLevel(str, enum.Enum):
    TIER_1 = "TIER_1"
    TIER_2 = "TIER_2"
    TIER_3 = "TIER_3"


class DocumentType(str, enum.Enum):
    NIN = "NIN"
    BVN = "BVN"
    PASSPORT = "PASSPORT"
    DRIVERS_LICENSE = "DRIVERS_LICENSE"
    VOTERS_CARD = "VOTERS_CARD"
    UTILITY_BILL = "UTILITY_BILL"
    SELFIE = "SELFIE"
    BANK_STATEMENT = "BANK_STATEMENT"
    EMPLOYMENT_LETTER = "EMPLOYMENT_LETTER"
    CAC_CERT = "CAC_CERT"


class ScreeningType(str, enum.Enum):
    SANCTIONS = "SANCTIONS"
    PEP = "PEP"
    ADVERSE_MEDIA = "ADVERSE_MEDIA"


class ScreeningResult(str, enum.Enum):
    CLEAR = "CLEAR"
    HIT = "HIT"
    REVIEW = "REVIEW"


class KYCSubmission(Base):
    __tablename__ = "kyc_submissions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tier: Mapped[KYCTierLevel] = mapped_column(
        PgEnum(KYCTierLevel, name="kyc_tier_level"), nullable=False
    )
    status: Mapped[KYCSubmissionStatus] = mapped_column(
        PgEnum(KYCSubmissionStatus, name="kyc_submission_status"),
        default=KYCSubmissionStatus.PENDING,
        nullable=False,
    )
    provider: Mapped[KYCProvider] = mapped_column(
        PgEnum(KYCProvider, name="kyc_provider"), default=KYCProvider.DOJAH, nullable=False
    )
    provider_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="kyc_submissions")
    documents: Mapped[list["KYCDocument"]] = relationship(
        "KYCDocument", back_populates="submission", cascade="all, delete-orphan"
    )
    liveness_checks: Mapped[list["KYCLivenessCheck"]] = relationship(
        "KYCLivenessCheck", back_populates="submission", cascade="all, delete-orphan"
    )


class KYCDocument(Base):
    __tablename__ = "kyc_documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("kyc_submissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_type: Mapped[DocumentType] = mapped_column(
        PgEnum(DocumentType, name="document_type"), nullable=False
    )
    document_number: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )  # AES-256-GCM encrypted
    file_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )  # Encrypted S3/R2 path
    verification_status: Mapped[str] = mapped_column(String(50), default="PENDING", nullable=False)
    extracted_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    submission: Mapped["KYCSubmission"] = relationship("KYCSubmission", back_populates="documents")


class KYCLivenessCheck(Base):
    __tablename__ = "kyc_liveness_checks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("kyc_submissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    passed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    submission: Mapped["KYCSubmission"] = relationship(
        "KYCSubmission", back_populates="liveness_checks"
    )


class AMLScreening(Base):
    __tablename__ = "aml_screenings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    screening_type: Mapped[ScreeningType] = mapped_column(
        PgEnum(ScreeningType, name="screening_type"), nullable=False
    )
    result: Mapped[ScreeningResult] = mapped_column(
        PgEnum(ScreeningResult, name="screening_result"), nullable=False
    )
    matches: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    screened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )  # FK to admin_users
