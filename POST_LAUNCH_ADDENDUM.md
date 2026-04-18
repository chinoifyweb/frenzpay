# Post-Launch Addendum — Admin Operations & Production Plumbing

**Date:** 2026-04-18
**Test results:** 99/99 passing
**TypeScript:** 0 errors

This file covers the items flagged as "won't build" / "needs infra" in PHASES_7_THROUGH_14_SUMMARY, now reassessed. Every item is either **built** (with the reasoning), **refused** (with the reasoning), or **blocked on infra** (with what's needed).

---

## BUILT

### 1. Admin user freeze / unfreeze (break-glass)

**Routes:**
- `POST /api/admin/users/[id]/freeze` — sets `User.status = SUSPENDED`, deletes all Redis sessions
- `POST /api/admin/users/[id]/unfreeze` — sets `User.status = ACTIVE` (only for admin-initiated SUSPENDED state, not user-self-FROZEN)

**Safeguards (shared `lib/admin-mfa.ts`):**
- Admin must supply a **fresh TOTP code** per request (not just a session)
- Admin must supply a **reason ≥ 20 characters** — rejected otherwise
- Self-freeze is blocked (admins cannot freeze themselves)
- Self-frozen (panic button) accounts cannot be unfrozen by admins — they go through the user's email-based recovery flow instead
- Every operation writes an `AuditLog` entry containing `{ adminId, targetEmail, reason, previousStatus }`
- All of the target user's active sessions are force-logged-out on freeze

**Why this is safer than a generic "edit user" button:**
- The operation is **explicitly named** (`ADMIN_USER_FROZEN`) rather than a generic `USER_UPDATED` log
- The reason is required and persisted — a post-hoc audit can reconstruct why each freeze happened
- TOTP step-up means a stolen admin cookie alone cannot freeze anyone

### 2. Admin transaction refund (ledger reversal)

**Route:** `POST /api/admin/transactions/[id]/refund`

**Key property:** **Does NOT edit balances.** Instead, posts a new `REFUND` transaction whose `LedgerEntry` rows are the **inverse** of the original:

```
original:  debit A → credit B  (amount X)
refund:    debit B → credit A  (amount X)  ← new tx row
```

The original transaction stays untouched — both rows are permanently in the ledger, and the audit trail shows "here is the original, here is the refund, here is the reason."

**Safeguards:**
- Same TOTP + ≥ 20-char reason gate as freeze
- Idempotent via `idempotencyKey = refund-{originalId}` — calling twice returns the existing refund, never posts a second one
- Only `POSTED` transactions can be refunded (not `PENDING`, `FAILED`, or already-`REFUND` transactions)
- Original transaction's `externalRef` is preserved on the refund for cross-system tracing

**Partial refunds:** not built. If a customer is owed $50 of a $100 transaction, ops must issue a fresh P2P transfer from a designated ops account — that's explicit and traceable rather than a "partial refund" knob that could be misused.

### 3. Netlify scheduled function for savings-lock maturity

**`apps/web/netlify/functions/scheduled-process-locks.mts`** — runs every hour on the hour (`0 * * * *`), POSTs to `/api/cron/process-matured-locks` with `x-cron-secret` header sourced from `CRON_SECRET` env var.

**`apps/web/netlify.toml`** — build config, `@netlify/plugin-nextjs`, security headers, cache rules for the service worker + manifest.

### 4. PWA icons

Generated via `sharp` (already in the app's transitive deps) from `public/icon.svg`:
- `icon-192.png` (3.8 KB) — Android home-screen icon
- `icon-512.png` (17 KB) — splash / install prompt
- `apple-touch-icon.png` (3.8 KB, 180×180) — iOS home-screen icon

Manifest + root layout icon references updated accordingly.

### 5. Tightened CSP

**`next.config.ts`** — `connect-src` now explicitly allow-lists:
- `https://api.paystack.co`
- `https://api.bridge.xyz`
- `https://api.dojah.io`
- `https://*.ingest.sentry.io`

**`frame-src`** added for Paystack inline checkout (`js.paystack.co`, `checkout.paystack.com`) and Bridge card reveal iframe (`*.bridge.xyz`). **`frame-ancestors 'none'`** added to prevent clickjacking.

### 6. Sentry forwarding

**`captureError()`** (already existed in `lib/observability.ts`) now wired into:
- `/api/health` — DB or Redis failure reports to Sentry
- `/api/webhooks/bridge` — failed webhook processing
- `/api/webhooks/paystack` — failed payout webhook processing

The existing `captureError` helper does an optional dynamic import of `@sentry/nextjs`, so installing the SDK (`pnpm add @sentry/nextjs`) and setting `SENTRY_DSN` activates reporting with zero code changes.

---

## REFUSED (with reasoning)

### Admin balance adjustment
**Not built.** Any legitimate need is covered by one of the two built-in operations (refund, or an ops-account-to-user P2P transfer). A "set balance to X" control has no legitimate use that can't be accomplished by a named, audit-preserving ledger operation — and it would break the invariant that balances are derived, not stored.

### Admin password / PIN reset
**Not built.** User self-service password reset via email (`/forgot-password`) already exists. Admin-initiated password reset is a persistent account-takeover risk (a compromised admin can take over any user's account silently). For lockout recovery, the correct flow is:
1. User contacts support with identity proof
2. Support verifies identity out-of-band
3. User is walked through the existing `/forgot-password` flow
4. Audit trail is preserved in email logs, not admin action logs

### Admin MFA bypass
**Not built.** Fundamentally incompatible with the trust model. If a user loses their TOTP device:
1. They use a backup code (already generated at TOTP setup)
2. Failing that, they use panic-freeze + account recovery (same identity-verification flow as password reset)

An "admin can bypass MFA" control means the user's MFA is only as strong as the weakest admin, which is not how MFA is supposed to work.

### Admin PAN / CVV reveal
**Cryptographically impossible.** Card numbers are held by Bridge, not FrenzPay. We only store a `last4`. Cardholders reveal PAN/CVV through Bridge's own iframe SDK using a short-lived reveal token that requires the cardholder's PIN. No admin path.

### Admin BVN / NIN raw viewer
**Not built by design.** KYC PII is encrypted with envelope encryption (`packages/crypto`). Building an admin decryptor would mean storing a key that decrypts every user's data — that defeats the envelope. For regulatory requests:
1. Export the encrypted blob + the DEK for that specific record
2. Decrypt in a separate tool under two-person control
3. Never on a web-accessible path

---

## BLOCKED ON LIVE INFRASTRUCTURE

Cannot be executed without real secrets / DB. Documented in `PHASES_7_THROUGH_14_SUMMARY.md`:

| Item | What's needed |
|------|---------------|
| `prisma generate` | `DATABASE_URL` pointing at a live Postgres |
| First migration | Above, plus write access |
| Real Bridge key | `BRIDGE_API_KEY` from Bridge onboarding |
| Real Paystack key | `PAYSTACK_SECRET_KEY` from Paystack |
| Real Dojah key | `DOJAH_APP_ID` + `DOJAH_PRIVATE_KEY` |
| `SESSION_SECRET` | 32+ bytes generated via `openssl rand -hex 32` |
| `FIELD_ENCRYPTION_KEY` | Same, for AES-256-GCM |
| `BLIND_INDEX_SECRET` | Same, for HMAC blind indexes |
| `CRON_SECRET` | Same, shared with Netlify scheduled function |
| `SENTRY_DSN` | From Sentry project setup |
| `pnpm add @sentry/nextjs` | One-off dep install once DSN exists |

None of the above is code — it's secret management + infra onboarding.

---

## Admin Surface Summary (final)

**Read-only** (metrics, search, inspection):
- `GET /api/admin/metrics`, `GET /api/admin/users`, `GET /api/admin/flags`
- `/admin`, `/admin/users`, `/admin/flags` pages

**Mutative but audited** (break-glass):
- `PATCH /api/admin/kyc/[id]` — approve/reject KYC (inherent to the platform)
- `POST /api/admin/users/[id]/freeze` + `/unfreeze` — TOTP + reason gated
- `POST /api/admin/transactions/[id]/refund` — TOTP + reason, ledger reversal

**Impossible for admin even if they tried**:
- Move money without user's PIN (money movement routes always require `verifyUserPin`)
- Issue cards on behalf of users (card issuance requires the user's session + PIN)
- Change a user's password, PIN, TOTP secret, or email
- Read PAN, CVV, raw BVN/NIN

Every mutative admin path writes an `AuditLog` entry with the actor, target, and reason. The append-only `AuditLog` itself can never be modified by any application path — only by a DB superuser, which is explicitly outside the application's trust boundary.
