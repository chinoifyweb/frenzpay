# ADR 0002 — Envelope Encryption & KMS

**Status:** Accepted  
**Date:** 2026-04-17  
**Author:** Arthur (Chinoify), CEO, Frenz LLC

---

## Context

FrenzPay handles Nigerian PII (BVN, NIN, DOB, residential address, government ID scans) that crosses jurisdictions (stored on EU Hetzner servers). This triggers:
- **NDPR** (Nigeria Data Protection Regulation) — encryption at rest required
- **FinCEN MSB** obligations — 5-7 year retention of KYC records
- **PCI-DSS SAQ A scope** — card data handled by Bridge (tokenised), not us

We must protect PII such that a database compromise does not expose any plaintext PII.

---

## Decision

### Envelope Encryption

Every PII field uses **envelope encryption**:

1. **Data Encryption Key (DEK)**: 256-bit random key generated per-field per-write.
2. **Encryption**: AES-256-GCM with a random 12-byte IV and 16-byte auth tag.
3. **DEK wrapping**: The DEK is encrypted ("wrapped") with the Key Encryption Key (KEK) using AES-256-GCM.
4. **Storage**: DB stores `{ ciphertext, iv, authTag, wrappedDek, keyVersion }` as JSONB.

The KEK is **never stored in the database**. It lives in Infisical (self-hosted on a separate Hetzner CX11 VPS firewalled to the app VPS IP + admin VPN).

### Blind Indexes

For equality lookups (duplicate BVN detection, phone lookups):
- HMAC-SHA-256(`BLIND_INDEX_KEY`, `normalised_plaintext`) → 64-char hex stored alongside encrypted field
- `BLIND_INDEX_KEY` is **separate** from the KEK and rotated independently
- Blind indexes are one-way — they reveal nothing about the plaintext

### Key Rotation Procedure

1. Generate new KEK version (e.g. `KEK_V2`) in Infisical.
2. Run `scripts/rotate-kek.ts` — reads all rows, decrypts DEK with `KEK_V1`, re-wraps with `KEK_V2`, writes updated `wrappedDek` + `keyVersion`.
3. Update `KEK_KEY_ID=v2` in Infisical (new writes use V2).
4. After 30-day grace period (for any stuck jobs), remove `KEK_V1` from Infisical.
5. Blind index key rotation is separate — a separate `scripts/rotate-blind-index.ts` script.

**Rotation cadence**: Quarterly, or immediately on suspected compromise.

### KYC Document Encryption

KYC documents (ID front/back, selfies, proof of address) are encrypted before S3 upload:
- Per-document DEK encrypted with the field KEK
- S3 objects have `private` ACL + IAM policy restricting access to the app role
- Admin panel fetches short-lived pre-signed URLs (15 min expiry) — never permanent public URLs
- Encrypted DEK stored in `kyc_documents.encrypted_dek`

### Prisma Middleware

`packages/db` includes Prisma middleware that:
- **On write**: automatically calls `encryptField()` on marked columns
- **On read**: automatically calls `decryptField()` on JSONB columns that are `CipherPayload`-shaped
- This means app code sees plaintext; only the DB sees ciphertext

---

## Fields Encrypted

| Model | Field | Has Blind Index? |
|-------|-------|-----------------|
| `User` | `phone`, `dob`, `addressLine1`, `addressLine2`, `city`, `postalCode` | phone only |
| `KycSubmission` | `fullLegalName`, `bvn`, `ssnLast4`, `nin`, `passportNumber`, `driverLicenseNumber` | bvn, nin, passport |

---

## Verification Test

After a signup + KYC submission in staging:
```sql
SELECT phone, dob, address_line1 FROM users WHERE email = 'test@example.com';
```
Should return JSONB blobs like `{"ciphertext":"...","iv":"...","authTag":"...","wrappedDek":"...","keyVersion":"v1"}` — **no plaintext visible**.

---

## Consequences

- **Performance**: ~0.5ms overhead per encrypted field read/write. Acceptable for KYC flows (not hot paths).
- **Migrations**: Adding a new encrypted field requires: (1) JSONB column + blind index column in schema, (2) entry in `packages/db` middleware, (3) entry in `PII_DENY_LIST` in `packages/logger`.
- **Backup encryption**: Separate — daily `pg_dump | gpg --symmetric AES256`. DB backups are encrypted even if a raw dump is obtained.
- **NDPR Transfer Basis**: EU hosting of Nigerian PII documented in `docs/compliance/ndpr-transfer-basis.md`.
