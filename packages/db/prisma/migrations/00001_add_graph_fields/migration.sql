-- Add fields needed to integrate with Graph (usegraph / Oval) API.
--
-- users.middle_name        — Graph /person requires name_other; we didn't
--                             collect middle names at signup before.
-- users.address_state      — NG 2-letter state code; required inside the
--                             address object sent to Graph.
-- users.graph_person_id    — Set once on KYC approval when we create the
--                             Graph Person; used as the foreign key into
--                             every subsequent Graph API call.
-- kyc_submissions.employment_status / occupation / expected_monthly_inflow_cents
--                          — Required components of Graph's
--                             background_information object for USD virtual
--                             accounts. NGN-only accounts leave these null.
--
-- All ADDs are IF NOT EXISTS so re-running the migration is safe.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "middle_name"       TEXT,
  ADD COLUMN IF NOT EXISTS "address_state"     TEXT,
  ADD COLUMN IF NOT EXISTS "graph_person_id"   TEXT;

-- Unique on graph_person_id so a single Graph Person record can only be
-- linked to one of our users. Add the constraint only if it doesn't exist
-- yet (Postgres doesn't have IF NOT EXISTS on ADD CONSTRAINT in all versions,
-- so we use the DO $$ BEGIN ... EXCEPTION ... END $$ pattern.)
DO $$
BEGIN
  ALTER TABLE "users"
    ADD CONSTRAINT "users_graph_person_id_key" UNIQUE ("graph_person_id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

ALTER TABLE "kyc_submissions"
  ADD COLUMN IF NOT EXISTS "employment_status"              TEXT,
  ADD COLUMN IF NOT EXISTS "occupation"                     TEXT,
  ADD COLUMN IF NOT EXISTS "expected_monthly_inflow_cents"  BIGINT;
