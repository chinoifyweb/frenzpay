"""Initial schema — all FrenzPay tables

Revision ID: 0001
Revises:
Create Date: 2026-04-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enums
    op.execute("CREATE TYPE kyctier AS ENUM ('TIER_0','TIER_1','TIER_2','TIER_3')")
    op.execute("CREATE TYPE kycstatus AS ENUM ('PENDING','IN_REVIEW','APPROVED','REJECTED')")
    op.execute("CREATE TYPE accountstatus AS ENUM ('ACTIVE','SUSPENDED','CLOSED')")
    op.execute("CREATE TYPE otppurpose AS ENUM ('SIGNUP','LOGIN','TRANSACTION','PASSWORD_RESET')")
    op.execute("CREATE TYPE kyc_tier_level AS ENUM ('TIER_1','TIER_2','TIER_3')")
    op.execute("CREATE TYPE kyc_submission_status AS ENUM ('PENDING','VERIFIED','REJECTED','EXPIRED')")
    op.execute("CREATE TYPE kyc_provider AS ENUM ('DOJAH','SMILE_ID','MANUAL')")
    op.execute("CREATE TYPE document_type AS ENUM ('NIN','BVN','PASSPORT','DRIVERS_LICENSE','VOTERS_CARD','UTILITY_BILL','SELFIE','BANK_STATEMENT','EMPLOYMENT_LETTER','CAC_CERT')")
    op.execute("CREATE TYPE screening_type AS ENUM ('SANCTIONS','PEP','ADVERSE_MEDIA')")
    op.execute("CREATE TYPE screening_result AS ENUM ('CLEAR','HIT','REVIEW')")
    op.execute("CREATE TYPE currency AS ENUM ('USD','GBP','EUR','NGN','KES','GHS','XAF','XOF')")
    op.execute("CREATE TYPE wallet_status AS ENUM ('ACTIVE','FROZEN','CLOSED')")
    op.execute("CREATE TYPE entry_type AS ENUM ('DEBIT','CREDIT')")
    op.execute("CREATE TYPE transaction_type AS ENUM ('DEPOSIT','WITHDRAWAL','FX_CONVERSION','INTERNAL_TRANSFER','FEE','REFUND')")
    op.execute("CREATE TYPE transaction_status AS ENUM ('INITIATED','PENDING','PROCESSING','COMPLETED','FAILED','REVERSED')")
    op.execute("CREATE TYPE beneficiary_type AS ENUM ('BANK_ACCOUNT','MOBILE_MONEY','STABLECOIN_WALLET')")

    # users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("date_of_birth", sa.DateTime(timezone=True), nullable=True),
        sa.Column("country", sa.String(2), nullable=False),
        sa.Column("kyc_tier", postgresql.ENUM("TIER_0","TIER_1","TIER_2","TIER_3", name="kyctier", create_type=False), nullable=False, server_default="TIER_0"),
        sa.Column("kyc_status", postgresql.ENUM("PENDING","IN_REVIEW","APPROVED","REJECTED", name="kycstatus", create_type=False), nullable=False, server_default="PENDING"),
        sa.Column("account_status", postgresql.ENUM("ACTIVE","SUSPENDED","CLOSED", name="accountstatus", create_type=False), nullable=False, server_default="ACTIVE"),
        sa.Column("two_factor_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("two_factor_secret", sa.String(255), nullable=True),
        sa.Column("referral_code", sa.String(20), nullable=False),
        sa.Column("referred_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("phone"),
        sa.UniqueConstraint("referral_code"),
        sa.ForeignKeyConstraint(["referred_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_phone", "users", ["phone"])

    # user_sessions
    op.create_table(
        "user_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("refresh_token_hash", sa.String(255), nullable=False),
        sa.Column("device_fingerprint", sa.String(255), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("refresh_token_hash"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])

    # otp_codes
    op.create_table(
        "otp_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("identifier", sa.String(255), nullable=False),
        sa.Column("code_hash", sa.String(255), nullable=False),
        sa.Column("purpose", postgresql.ENUM("SIGNUP","LOGIN","TRANSACTION","PASSWORD_RESET", name="otppurpose", create_type=False), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_otp_identifier", "otp_codes", ["identifier"])

    # kyc_submissions
    op.create_table(
        "kyc_submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tier", postgresql.ENUM("TIER_1","TIER_2","TIER_3", name="kyc_tier_level", create_type=False), nullable=False),
        sa.Column("status", postgresql.ENUM("PENDING","VERIFIED","REJECTED","EXPIRED", name="kyc_submission_status", create_type=False), nullable=False, server_default="PENDING"),
        sa.Column("provider", postgresql.ENUM("DOJAH","SMILE_ID","MANUAL", name="kyc_provider", create_type=False), nullable=False, server_default="DOJAH"),
        sa.Column("provider_reference", sa.String(255), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("raw_response", postgresql.JSONB(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_kyc_submissions_user_id", "kyc_submissions", ["user_id"])

    # kyc_documents
    op.create_table(
        "kyc_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_type", postgresql.ENUM("NIN","BVN","PASSPORT","DRIVERS_LICENSE","VOTERS_CARD","UTILITY_BILL","SELFIE","BANK_STATEMENT","EMPLOYMENT_LETTER","CAC_CERT", name="document_type", create_type=False), nullable=False),
        sa.Column("document_number", sa.String(255), nullable=True),
        sa.Column("file_url", sa.String(500), nullable=True),
        sa.Column("verification_status", sa.String(50), nullable=False, server_default="PENDING"),
        sa.Column("extracted_data", postgresql.JSONB(), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["submission_id"], ["kyc_submissions.id"], ondelete="CASCADE"),
    )

    # kyc_liveness_checks
    op.create_table(
        "kyc_liveness_checks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider_reference", sa.String(255), nullable=True),
        sa.Column("passed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("raw_response", postgresql.JSONB(), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["submission_id"], ["kyc_submissions.id"], ondelete="CASCADE"),
    )

    # aml_screenings
    op.create_table(
        "aml_screenings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("screening_type", postgresql.ENUM("SANCTIONS","PEP","ADVERSE_MEDIA", name="screening_type", create_type=False), nullable=False),
        sa.Column("result", postgresql.ENUM("CLEAR","HIT","REVIEW", name="screening_result", create_type=False), nullable=False),
        sa.Column("matches", postgresql.JSONB(), nullable=True),
        sa.Column("screened_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    # wallets
    op.create_table(
        "wallets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("currency", postgresql.ENUM("USD","GBP","EUR","NGN","KES","GHS","XAF","XOF", name="currency", create_type=False), nullable=False),
        sa.Column("balance", sa.Numeric(20, 4), nullable=False, server_default="0"),
        sa.Column("available_balance", sa.Numeric(20, 4), nullable=False, server_default="0"),
        sa.Column("held_balance", sa.Numeric(20, 4), nullable=False, server_default="0"),
        sa.Column("graph_account_id", sa.String(255), nullable=True),
        sa.Column("status", postgresql.ENUM("ACTIVE","FROZEN","CLOSED", name="wallet_status", create_type=False), nullable=False, server_default="ACTIVE"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "currency", name="uq_wallet_user_currency"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_wallets_user_id", "wallets", ["user_id"])

    # virtual_accounts
    op.create_table(
        "virtual_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("wallet_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("account_number", sa.String(50), nullable=True),
        sa.Column("routing_number", sa.String(50), nullable=True),
        sa.Column("iban", sa.String(50), nullable=True),
        sa.Column("bank_name", sa.String(255), nullable=True),
        sa.Column("account_name", sa.String(255), nullable=True),
        sa.Column("provider", sa.String(50), nullable=False, server_default="GRAPH"),
        sa.Column("provider_reference", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider_reference"),
        sa.ForeignKeyConstraint(["wallet_id"], ["wallets.id"], ondelete="CASCADE"),
    )

    # transactions
    op.create_table(
        "transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reference", sa.String(50), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("type", postgresql.ENUM("DEPOSIT","WITHDRAWAL","FX_CONVERSION","INTERNAL_TRANSFER","FEE","REFUND", name="transaction_type", create_type=False), nullable=False),
        sa.Column("status", postgresql.ENUM("INITIATED","PENDING","PROCESSING","COMPLETED","FAILED","REVERSED", name="transaction_status", create_type=False), nullable=False, server_default="INITIATED"),
        sa.Column("source_wallet_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("destination_wallet_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_amount", sa.Numeric(20, 4), nullable=False),
        sa.Column("source_currency", sa.String(10), nullable=False),
        sa.Column("destination_amount", sa.Numeric(20, 4), nullable=False),
        sa.Column("destination_currency", sa.String(10), nullable=False),
        sa.Column("exchange_rate", sa.Numeric(20, 8), nullable=False, server_default="1"),
        sa.Column("frenzpay_fee", sa.Numeric(20, 4), nullable=False, server_default="0"),
        sa.Column("frenzpay_fx_markup", sa.Numeric(20, 4), nullable=False, server_default="0"),
        sa.Column("graph_fee", sa.Numeric(20, 4), nullable=False, server_default="0"),
        sa.Column("graph_reference", sa.String(255), nullable=True),
        sa.Column("idempotency_key", sa.String(255), nullable=False),
        sa.Column("initiated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("reference"),
        sa.UniqueConstraint("idempotency_key"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["source_wallet_id"], ["wallets.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["destination_wallet_id"], ["wallets.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_transaction_user_created", "transactions", ["user_id", "initiated_at"])

    # ledger_entries
    op.create_table(
        "ledger_entries",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("transaction_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("wallet_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entry_type", postgresql.ENUM("DEBIT","CREDIT", name="entry_type", create_type=False), nullable=False),
        sa.Column("amount", sa.Numeric(20, 4), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False),
        sa.Column("balance_after", sa.Numeric(20, 4), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["wallet_id"], ["wallets.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_ledger_wallet_created", "ledger_entries", ["wallet_id", "created_at"])

    # beneficiaries
    op.create_table(
        "beneficiaries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("nickname", sa.String(100), nullable=True),
        sa.Column("type", postgresql.ENUM("BANK_ACCOUNT","MOBILE_MONEY","STABLECOIN_WALLET", name="beneficiary_type", create_type=False), nullable=False),
        sa.Column("country", sa.String(2), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False),
        sa.Column("account_number", sa.String(255), nullable=True),
        sa.Column("account_name", sa.String(255), nullable=True),
        sa.Column("bank_name", sa.String(255), nullable=True),
        sa.Column("bank_code", sa.String(50), nullable=True),
        sa.Column("mobile_money_provider", sa.String(100), nullable=True),
        sa.Column("stablecoin_network", sa.String(50), nullable=True),
        sa.Column("stablecoin_address", sa.String(500), nullable=True),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_favorite", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    # fx_rates
    op.create_table(
        "fx_rates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_currency", sa.String(10), nullable=False),
        sa.Column("to_currency", sa.String(10), nullable=False),
        sa.Column("graph_rate", sa.Numeric(20, 8), nullable=False),
        sa.Column("frenzpay_rate", sa.Numeric(20, 8), nullable=False),
        sa.Column("markup_bps", sa.Integer(), nullable=False),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fx_rates_pair_expiry", "fx_rates", ["from_currency", "to_currency", "valid_until"])

    # audit_logs
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("admin_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=True),
        sa.Column("resource_id", sa.String(255), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("fx_rates")
    op.drop_table("beneficiaries")
    op.drop_table("ledger_entries")
    op.drop_table("transactions")
    op.drop_table("virtual_accounts")
    op.drop_table("wallets")
    op.drop_table("aml_screenings")
    op.drop_table("kyc_liveness_checks")
    op.drop_table("kyc_documents")
    op.drop_table("kyc_submissions")
    op.drop_table("otp_codes")
    op.drop_table("user_sessions")
    op.drop_table("users")

    for enum_name in [
        "beneficiary_type", "transaction_status", "transaction_type", "entry_type",
        "wallet_status", "currency", "screening_result", "screening_type", "document_type",
        "kyc_provider", "kyc_submission_status", "kyc_tier_level", "otppurpose",
        "accountstatus", "kycstatus", "kyctier",
    ]:
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")
