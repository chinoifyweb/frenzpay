-- Add voter's card support to internal KYC.
--
-- Customers without NIN, driver's license, or international passport can
-- now submit their PVC (Permanent Voter's Card). This matches the doc
-- types Graph accepts at https://usegraph.readme.io/reference/upgrade-person-kyc
-- and unblocks the segment of users who only carry their PVC.
--
-- Encrypted JSONB CipherPayload, mirroring the layout used for nin,
-- passport_number, and driver_license_number. No blind index — voter's
-- numbers aren't used as a lookup key.

ALTER TABLE "kyc_submissions"
  ADD COLUMN IF NOT EXISTS "voters_card_number" JSONB;
