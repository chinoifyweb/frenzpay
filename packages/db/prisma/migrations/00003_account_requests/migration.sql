-- Customer-initiated requests for virtual bank accounts.
--
-- Replaces the previous flow where KYC approval auto-provisioned a
-- Bridge customer + Graph person (and on first /api/accounts/activate
-- call, an actual virtual account). Now KYC approval only changes the
-- user's tier; the customer has to explicitly request each currency
-- they want, and an admin manually approves before any virtual account
-- gets created on the rail.
--
-- Statuses:
--   PENDING   — submitted, awaiting admin review
--   APPROVED  — admin clicked approve; provisioning ran; account ready
--   REJECTED  — admin declined; rejection_reason_* explains why

CREATE TABLE IF NOT EXISTS "account_requests" (
  "id"                            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"                       UUID         NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "currency"                      TEXT         NOT NULL,
  "status"                        TEXT         NOT NULL DEFAULT 'PENDING',

  -- Step 2 of the customer wizard — purpose + source of funds + monthly
  -- inflow specific to THIS account application. Compliance wants this
  -- per-account, separately from the once-at-KYC capture.
  "source_of_funds"               TEXT,
  "purpose"                       TEXT,
  "expected_monthly_inflow_cents" BIGINT,

  -- Set on review
  "rejection_reason"              TEXT,
  "rejection_reason_code"         TEXT,
  "reviewed_by"                   UUID,
  "reviewed_at"                   TIMESTAMPTZ,

  -- Filled in after the admin approves and provisioning succeeds.
  "external_account_id"           UUID,

  "submitted_at"                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "created_at"                    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"                    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "account_requests_user_id_idx" ON "account_requests"("user_id");
CREATE INDEX IF NOT EXISTS "account_requests_status_idx"  ON "account_requests"("status");

-- Compliance-friendly: a customer can have many APPROVED + REJECTED rows
-- in history per currency, but at most one PENDING for a given currency
-- at a time (so they can't submit a flood of duplicates).
CREATE UNIQUE INDEX IF NOT EXISTS "account_requests_one_pending_per_currency"
  ON "account_requests"("user_id", "currency")
  WHERE "status" = 'PENDING';
