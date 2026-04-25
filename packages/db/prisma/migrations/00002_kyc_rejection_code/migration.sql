-- Add a stable code alongside the freeform `rejection_reason` text on KYC
-- submissions. The code corresponds to a template in
-- apps/web/src/lib/kyc-rejection-templates.ts (e.g. DOC_BLURRY,
-- POA_TOO_OLD, OTHER) and lets us:
--
--   1. Render the matching customer-facing "What to do next" checklist on
--      the dashboard + in the rejection email without the admin having to
--      retype boilerplate every time.
--   2. Group rejection patterns analytically — "60% of rejections this
--      week were DOC_BLURRY, we should improve our upload tips".
--
-- Nullable on purpose: pre-existing rows from before this migration have
-- no code, and the admin UI still allows fully freeform rejections (the
-- code is `OTHER` in that case but stored as NULL for older rows).

ALTER TABLE "kyc_submissions"
  ADD COLUMN IF NOT EXISTS "rejection_reason_code" TEXT;
