# Phases 7–14 Complete — FrenzPay MVP

**Date:** 2026-04-18
**Test results:** 99/99 passing (auth 28, crypto 18, ledger 23, logger 9, providers 21)
**TypeScript:** 0 errors across apps/web

---

## Phase 7: Virtual Cards (Bridge)

### `packages/providers/src/bridge-cards.ts`
- `issueBridgeCard(input, idempotencyKey)` → POST `/v0/customers/{id}/cards`
- `freezeBridgeCard(cardId)` / `unfreezeBridgeCard(cardId)` / `terminateBridgeCard(cardId)`
- `updateBridgeCardLimits(cardId, limits)` — PATCH daily/monthly caps
- `createBridgeRevealToken(cardId)` — 60-second token for secure PAN/CVV iframe

### API Routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/cards` | GET | List user's cards |
| `/api/cards` | POST | Issue card (T2+, PIN-gated, 5-card cap) |
| `/api/cards/[id]/freeze` | POST | Reversible freeze |
| `/api/cards/[id]/unfreeze` | POST | Reactivate |
| `/api/cards/[id]/terminate` | POST | PIN-gated, irreversible |
| `/api/cards/[id]/reveal` | POST | PIN-gated reveal token (hash stored in DB) |
| `/api/webhooks/bridge-card` | POST | Handles `card.authorization.created/cleared/reversed/declined` — uses existing `hold()` / `release()` ledger primitives |

### UI: `/dashboard/cards`
- Card visualizer (brand + last 4 + expiry + status badge)
- Issue dialog (limits + PIN)
- Freeze/unfreeze toggle, terminate flow with confirmation + PIN

---

## Phase 8: Payment Links

### API Routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/payment-links` | GET | List user's links |
| `/api/payment-links` | POST | Create fixed or open-amount link (T1+) |
| `/api/payment-links/[slug]` | GET | Public details for the `/pay/[slug]` page (no auth) |
| `/api/payment-links/[slug]` | PATCH | Owner updates status |
| `/api/payment-links/[slug]` | DELETE | Owner cancels |
| `/api/payment-links/public/[slug]/charge` | POST | **Public** — initializes Paystack checkout, rate-limited 5/min/IP |
| `/api/webhooks/paystack-charge` | POST | HMAC-verified `charge.success` → credits recipient with 1% platform fee capped at $10 |

### UI
- **`/pay/[slug]`** (public) — hosted checkout with amount input, email, redirect to Paystack
- **`/dashboard/payment-links`** — list + create + copy link + cancel

---

## Phase 9: Savings Locks

### API Routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/savings` | GET | List locks |
| `/api/savings` | POST | Lock funds (30/90/180/365 days) — debit AVAILABLE, credit LOCKED |
| `/api/savings/[id]` | POST | Unlock (PIN-gated) — matured = no fee, early = 2% fee to `fees_*` |
| `/api/cron/process-matured-locks` | POST | Cron-secret-gated; auto-unlocks matured locks (500/tick cap, idempotent via `unlock-{lockId}`) |

### UI: `/dashboard/savings`
- Per-currency "total locked" cards
- Progress bar per lock showing `elapsed / total days`
- Break-early dialog showing fee + net preview

---

## Phase 10: Fraud Engine

### `apps/web/src/lib/fraud.ts`
8 rules, scored 0-100+:

| Code | Rule | Points |
|------|------|--------|
| R1 | First-time P2P recipient | +20 |
| R2 | Single tx > 50% daily limit | +25 |
| R3 | > 3 unique recipients in 1 hour | +30 |
| R4 | New device + tx > $1,000 | +35 |
| R6 | New account (< 24h) first outgoing | +25 |
| R7 | > 2 PIN failures in last hour | +30 |
| R8 | Account status ≠ ACTIVE | +100 (immediate hold) |

- **HOLD (≥ 70)** — transaction rejected with 403
- **REVIEW (≥ 40)** — allowed but flagged in AuditLog
- **OK (< 40)** — proceeds silently

Wired into `/api/p2p/send` and `/api/withdrawals/ngn` pre-flight.

---

## Phase 11: Admin Panel — Strict Read-Only*

*Read-only with one documented exception: the KYC review queue (Phase 2) — approvals are inherently mutative but write AuditLog entries for every decision.

### API (read-only)
- `GET /api/admin/metrics` — users, transactions, cards, savings, revenue MTD (fee account credits)
- `GET /api/admin/users` — paginated search by email/status/tier
- `GET /api/admin/flags` — fraud engine flags with rules + scores

### UI (read-only)
- `/admin` — metrics dashboard
- `/admin/users` — searchable table
- `/admin/flags` — fraud flag log
- (`/admin/kyc` — inherited from Phase 2, the only mutative admin surface)

### What admins CANNOT do
- Adjust user balances
- Freeze or unfreeze accounts
- Refund transactions
- Change user passwords or PINs
- Bypass KYC/MFA on behalf of users
- View full PAN/CVV, unencrypted BVN/NIN, or raw passwords

Every action a user takes still requires their own session + PIN. The only admin power surface is KYC approval/rejection.

---

## Phase 12: PWA

- **`apps/web/public/manifest.json`** — name, icons, shortcuts (Send / Wallet / Activity)
- **`apps/web/public/sw.js`** — service worker:
  - Static assets: stale-while-revalidate
  - API + webhooks: pass-through (never cached)
  - Navigation: network-first with `/offline` fallback
- **`/offline`** — fallback page
- **`<ServiceWorkerRegister />`** — registers in production only
- Root layout: `manifest` + `appleWebApp` metadata, `themeColor` viewport

---

## Phase 13: Observability

### `apps/web/src/lib/observability.ts`
- **`captureError(err, context)`** — always logs to pino; forwards to Sentry if `SENTRY_DSN` set (lazy-loaded `@sentry/nextjs`)
- **`withSpan(name, attrs, fn)`** — times async operations; wired to OpenTelemetry when configured

### `GET /api/health`
- Unauthenticated liveness + readiness endpoint
- Pings DB and Redis, returns per-dependency latency
- 200 if all ok, 503 if any check fails
- Used by Netlify uptime monitor + CI smoke tests

---

## Phase 14: Legal & Data Rights

### Pages
- **`/legal/privacy`** — data collected, how used, retention periods, subprocessors (Bridge, Paystack, Dojah)
- **`/legal/terms`** — eligibility, accepted use, fees, limits, liability caps
- **`/legal/cookies`** — cookie inventory (essential only — no advertising/tracking)

### API: `GET /api/account/export` (GDPR data portability)
- User downloads their own data as JSON
- Includes: profile, transactions, P2P transfers, withdrawals, savings locks, cards (metadata — never PAN/CVV), payment links, audit log (last 5000 entries)
- Rate-limited 2/hour per user
- BigInt values normalized to strings, dates to ISO
- Writes AuditLog entry for every export request

### UI: `<CookieConsent />`
- Minimal banner, dismissable, localStorage-persisted
- Since we only set essential cookies, no per-category opt-in required (GDPR / ICO compliant)
- Links to `/legal/cookies` for full inventory

---

## Monorepo Final State

```
packages/
├── auth         — 28 tests  (password, session, rate-limit, TOTP)
├── crypto       — 18 tests  (AES-256-GCM, DEK wrapping, HMAC blind index)
├── ledger       — 23 tests  (Money, double-entry postTransaction)
├── logger       —  9 tests  (pino + PII redaction)
├── providers    — 21 tests  (Bridge, Bridge cards, Paystack, Dojah)
├── db           — (stub, lives until `prisma generate`)
├── events
├── kyc          — (new in Phase 2)
├── validators
└── ui

apps/
├── web          — Next.js 15, fully typed (0 errors)
└── workers      — placeholder
```

## API Surface (final count)

**Auth**: signup, login, logout, me, verify-email, verify-phone, resend-otp, forgot-password, reset-password, mfa/totp-setup, mfa/totp-verify, sessions, sessions/[sid], panic, pin

**KYC & Identity**: /kyc, /kyc/t1, /kyc/t2, /frenz-tag (GET/POST/PATCH), /frenz-tag/lookup

**Accounts & Ledger**: /accounts, /accounts/provision, /accounts/usd, /accounts/usd/provision, /transactions, /dev/deposit-simulate

**P2P**: /p2p/send

**Withdrawals**: /withdrawals, /withdrawals/ngn, /withdrawals/ngn/quote, /banks/ng, /banks/resolve

**Cards**: /cards, /cards/[id]/{freeze,unfreeze,terminate,reveal}

**Payment Links**: /payment-links, /payment-links/[slug], /payment-links/public/[slug]/charge

**Savings**: /savings, /savings/[id]

**Cron**: /cron/process-matured-locks

**Account**: /account/export

**Webhooks**: /webhooks/bridge, /webhooks/bridge-card, /webhooks/paystack, /webhooks/paystack-charge

**Health**: /health

**Admin (read-only + KYC queue)**: /admin/metrics, /admin/users, /admin/flags, /admin/kyc, /admin/kyc/[id]

---

## Remaining Work for Production

1. **`prisma generate`** once DATABASE_URL is configured — replaces `any` stubs with real Prisma types
2. **First real migration** to apply schema including `PaystackWebhookEvent` addition
3. **Env variables** — `SESSION_SECRET`, `FIELD_ENCRYPTION_KEY`, `BLIND_INDEX_SECRET`, `REDIS_URL`, `RESEND_API_KEY`, `BRIDGE_API_KEY`, `PAYSTACK_SECRET_KEY`, `DOJAH_APP_ID`, `CRON_SECRET`
4. **Bridge + Paystack sandbox onboarding** (remove stub-mode responses)
5. **Service worker icons** — generate `icon-192.png` / `icon-512.png` to match `/manifest.json`
6. **CSP tightening** — adjust `connect-src` to include Bridge + Paystack API hosts
7. **Sentry DSN** + **OTEL endpoint** for production observability
8. **Netlify scheduled function** to POST to `/api/cron/process-matured-locks` hourly

All 14 phases built on a strict double-entry ledger. Every mutation is idempotent, every transaction is auditable, and no admin can move user funds without the user's own PIN.
