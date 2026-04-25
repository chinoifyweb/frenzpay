-- Stable identifier of the Google account this Frenz Pay user has linked.
-- Comes from the `sub` claim in the OIDC ID token returned by Google's
-- token endpoint. Using `sub` (not the email) means a customer who changes
-- the email on their Google account is still recognised as the same person
-- on the next sign-in.
--
-- Nullable: existing users without Google linkage have NULL. Unique:
-- prevents two Frenz Pay accounts from claiming the same Google identity.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "google_sub" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_google_sub_idx"
  ON "users"("google_sub")
  WHERE "google_sub" IS NOT NULL;
