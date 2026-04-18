# Phase 2 Complete — KYC & FrenzTag

**Date:** 2026-04-17  
**Test results:** 78/78 passing (unchanged from Phase 1)  
**TypeScript:** 0 errors across apps/web

---

## What Was Built

### `packages/kyc` — New Package

| Export | Description |
|--------|-------------|
| `KYC_TIERS`, `KycTierValue` | Type-safe tier enum `T0 | T1 | T2 | T3` |
| `KYC_TIER_LABELS`, `KYC_TIER_DESCRIPTIONS` | Human-readable tier metadata |
| `KYC_TIER_LIMITS` | Default daily/balance limits per tier (BigInt cents) |
| `validateFrenzTag(tag)` | Format check (`/^[a-z][a-z0-9]{5,7}$/`) + reserved-word block |
| `FRENZ_TAG_RESERVED` | 50+ reserved words (admin, support, frenz, bank, etc.) |
| `FRENZ_TAG_QUARANTINE_DAYS` | 30-day quarantine after tag release |
| `FRENZ_TAG_CHANGE_LIMIT_PER_YEAR` | Once per 365 days |
| `isValidBvnFormat(bvn)` | 11-digit Nigerian BVN format check |
| `isValidNinFormat(nin)` | 11-digit NIN format check |
| `isValidPassportFormat(passport)` | Letter + 7-8 digits format check |
| `canSubmitForTier(current, target)` | Tier advancement eligibility guard |
| `KycStatusResponse` | Typed API response shape |

**`packages/kyc/src/dojah.ts`** — Dojah KYC provider client:
- `verifyBvn(bvn, userId)` → checks `/v1/kyc/bvn`, stubs to `{ verified: true }` in dev
- `verifyNin(nin, userId)` → checks `/v1/kyc/nin`
- `verifyLiveness(selfieBase64, userId)` → checks `/v1/kyc/selfie`, requires ≥0.7 confidence

---

### API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/kyc` | GET | Current tier, kycStatus, frenzTag, pendingSubmission, tier limits |
| `/api/kyc/t1` | POST | Submit BVN + full legal name. Auto-approves via Dojah if key present, else queues PENDING |
| `/api/kyc/t2` | POST | Multipart upload: ID front/back + selfie + docNumber + sourceOfFunds |
| `/api/frenz-tag` | GET | Availability check (`?tag=xxx`) — no auth required |
| `/api/frenz-tag` | POST | Claim FrenzTag (advances T0→T1 automatically) |
| `/api/frenz-tag` | PATCH | Change FrenzTag (once/year, 30-day quarantine on old tag) |
| `/api/admin/kyc` | GET | List submissions for admin (filterable by status/tier, paginated) |
| `/api/admin/kyc/[id]` | PATCH | Approve or reject with reason — advances/reverts user tier |

**Key behaviours:**
- BVN deduplication via `blindIndex()` HMAC — prevents cross-account BVN reuse
- All PII (BVN, NIN, passport, legal name) encrypted via `encryptField()` before DB persistence
- FrenzTag claim is atomic via Prisma transaction + unique constraint (P2002 caught)
- Admin review writes AuditLog entry for every decision
- Old admin KYC route (raw SQL) → rewritten with Prisma

---

### UI Pages

**`apps/web/src/app/dashboard/kyc/page.tsx`**
- 4-node tier progress stepper (T0→T3) with `<Progress>` bar
- FrenzTag section: debounced availability check (500ms), inline feedback, claim/change flow
- BVN section: full legal name + masked BVN input (show/hide toggle)
- Document upload section (T2): drag-and-drop zones for ID front, ID back (optional), selfie with preview thumbnails
- Pending review yellow banner when submission is in progress
- Tier benefits card showing daily/balance limits

**`apps/web/src/app/admin/kyc/page.tsx`**
- Filterable submissions table (status + tier dropdowns)
- Review dialog with user info, submission metadata, document list
- Approve (green) / Reject (red, requires reason ≥10 chars) buttons
- Paginated with prev/next controls
- Error boundary with retry button

---

## Tier Advancement Rules

```
T0 → T1: Claim FrenzTag (instant) + BVN verification (Dojah auto OR manual review)
T1 → T2: Upload government ID + selfie + source of funds (always manual admin review)
T2 → T3: Enhanced due diligence (future implementation)
```

## Daily Limits Reference

| Tier | Deposit | Withdraw | Balance Cap | P2P Send |
|------|---------|----------|-------------|----------|
| T0   | $0      | $0       | $0          | $0       |
| T1   | $500    | $500     | $1,000      | $200     |
| T2   | $5,000  | $5,000   | $20,000     | $2,000   |
| T3   | $50,000 | $50,000  | $500,000    | $20,000  |

---

## Environment Variables Required

```env
DOJAH_APP_ID=           # Dojah app ID (optional — omit for manual-only flow)
DOJAH_PRIVATE_KEY=      # Dojah private key
FIELD_ENCRYPTION_KEY=   # AES-256-GCM key (read by @frenzpay/crypto)
BLIND_INDEX_SECRET=     # HMAC secret for blind indexes (read by @frenzpay/crypto)
```

---

## Next: Phase 3 — Ledger Core & Accounts
