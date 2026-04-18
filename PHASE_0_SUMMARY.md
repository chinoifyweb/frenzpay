# Phase 0 Summary — Infrastructure & Project Scaffolding

**Completed:** 2026-04-17  
**Phase:** 0 of 14  
**Status:** ✅ Complete

---

## What Was Built

### Monorepo Structure (pnpm workspaces)
Converted from a flat Next.js project to a full pnpm monorepo:

```
frenzpay/
├── apps/
│   ├── web/           ← Existing Next.js app (moved from root src/)
│   ├── admin/         ← Existing Next.js admin panel
│   └── workers/       ← New BullMQ worker process (stub)
├── packages/
│   ├── db/            ← Prisma schema + seed + client singleton
│   ├── crypto/        ← Envelope encryption (AES-256-GCM + blind indexes)
│   ├── logger/        ← Pino + PII redaction deny-list
│   ├── ledger/        ← Double-entry primitives + BigInt Money class
│   ├── providers/     ← Provider interfaces (BaaS, Payout, KYC, FX, SMS, Email)
│   ├── auth/          ← Password/PIN hashing (Argon2id), OTP, secure tokens
│   ├── validators/    ← Shared Zod schemas
│   ├── events/        ← Domain event type definitions
│   └── ui/            ← Shared UI components (stub)
├── infra/
│   ├── cyberpanel/    ← Setup shell scripts (01-06)
│   ├── nginx-ols/     ← OLS reverse proxy config
│   ├── pm2/           ← ecosystem.config.js
│   └── backups/       ← Encrypted backup scripts + restore drill
├── .github/workflows/ ← CI (lint → typecheck → test → build) + deploy workflow
├── docs/
│   ├── ADR/           ← 0001-stack.md, 0002-crypto-and-kms.md
│   ├── runbooks/      ← README with incident severity table
│   └── compliance/    ← ndpr-transfer-basis.md
├── .env.example       ← All 40+ env vars documented
├── biome.json         ← Lint + format config
├── tsconfig.base.json ← Shared strict TypeScript config
└── pnpm-workspace.yaml
```

### packages/db — Prisma Schema
Complete schema covering all 14 phases:
- Identity & Auth: `User`, `FrenzTag`, `Session`, `Device`, `LoginAttempt`, `MfaSecret`, `Passkey`, `TransactionPin`, `PasswordResetToken`, `EmailVerificationToken`, `PhoneOtp`
- KYC: `KycSubmission`, `KycDocument`, `SanctionsCheck`, `KycTierLimit`, `TierLimitOverride`
- Ledger: `Account`, `Transaction`, `LedgerEntry` (immutable), `BalanceSnapshot`
- Bridge: `UserExternalAccount`, `BridgeWebhookEvent`
- P2P: `P2PTransfer`, `MoneyRequest`, `Beneficiary`
- Withdrawals: `Withdrawal`, `FlutterwaveWebhookEvent`
- Cards: `Card`, `CardAuthorization`
- Payment Links: `PaymentLink`, `Invoice`, `InvoiceLineItem`, `InvoicePayment`
- Savings: `SavingsLock`
- Fraud: `FraudRuleEvaluation`, `ReconciliationAlert`, `WebhookAuditLog`
- Admin: `AdminUser`, `AdminAuditLog` (append-only), `AuditLog`
- Platform: `PlatformSetting`, `WebPushSubscription`, `LegalConsent`

Migration `00000_init_append_only_trigger`: Postgres triggers blocking UPDATE/DELETE on `ledger_entries` and `*_audit_logs`.

### packages/crypto — Envelope Encryption
- `encryptField(plaintext, context?): CipherPayload` — AES-256-GCM, fresh DEK per call
- `decryptField(payload, context?): string` — verifies auth tag (tamper-proof)
- `blindIndex(value): string` — HMAC-SHA-256 for equality lookups on encrypted fields
- `blindIndexEqual(a, b): boolean` — constant-time comparison
- `rotateKey(payloads, newKeyVersion): CipherPayload[]` — for quarterly KEK rotation
- `isCipherPayload(value): boolean` — type guard
- **1,000 random property-based tests** proving round-trip fidelity + tamper rejection

### packages/logger — Pino + PII Redaction
- 30-key deny-list covering all sensitive fields (password, pin, bvn, ssn, nin, etc.)
- Deep redaction at any nesting depth (objects + arrays)
- Secondary regex scrub on message strings (raw card numbers, JWTs, Bearer tokens)
- Unit tests prove redaction fires on every key in the deny-list
- `createRequestLogger(ctx)` for per-request structured logging with `requestId/userId/traceId`

### packages/ledger — Double-Entry Ledger
- `Money` class: BigInt amount + currency, immutable, currency-mismatch-safe arithmetic
- `convert(from, toCurrency, rate): Money` — FX conversion with banker's rounding + markup bps
- `postTransaction(prisma, input): Promise<{id, status}>` — atomic, idempotency-checked
- `balanceOf(prisma, accountId): Promise<bigint>` — derived from ledger sums, never from a balance column
- `availableBalanceOf(prisma, userId, currency): Promise<bigint>`
- `hold/release` primitives for card authorizations
- Property-based tests: ledger invariant (Σ debits = Σ credits), 1,000 random arithmetic tests

### Infra Scripts
- `01-system-prep.sh` — OS updates, timezone UTC, 4GB swap, unattended-upgrades
- `02-node-pm2.sh` — Node 22 via nvm, pnpm, PM2, PM2 systemd service
- `03-postgres.sh` — PG16 from PGDG, pgcrypto, TLS, pg_hba.conf (localhost only)
- `04-redis.sh` — Redis 7, requirepass, localhost-only, disabled dangerous commands
- `06-firewall.sh` — ufw (22+80+443 only) + fail2ban
- `07-backups.sh` — Encrypted `pg_dump | gpg AES256` to Hetzner Storage Box
- `07b-restore-drill.sh` — Weekly restore validation to throwaway DB
- `infra/pm2/ecosystem.config.js` — web (cluster x2), admin (fork x1), workers (fork x1)
- `infra/nginx-ols/app.frenzpay.co.conf` — OLS reverse proxy config

### CI/CD
- `.github/workflows/ci.yml` — secret-scan → lint → typecheck → test (with PG+Redis services) → build → audit
- `.github/workflows/deploy.yml` — SSH deploy: pull → install → migrate → build → pm2 reload

### Documentation
- `docs/ADR/0001-stack.md` — Technology choices and rationale
- `docs/ADR/0002-crypto-and-kms.md` — Envelope encryption scheme, KEK rotation
- `docs/compliance/ndpr-transfer-basis.md` — Nigerian PII cross-border transfer basis
- `docs/SECURITY.md` — Bug bounty, scope, safe harbor, coordinated disclosure
- `public/.well-known/security.txt` — RFC 9116 compliant

---

## What Was Deferred

- `08-kms.sh` (Infisical setup) — Phase 0 stub pending Hetzner CX11 provisioning
- `09-ssh-hardening.sh` — Deferred (existing SSH config is adequate for now)
- `05-cyberpanel-vhost.sh` — OLS vhost creation (manual step in CyberPanel UI)
- Prisma `prisma generate` — needs DATABASE_URL pointing at live PG16 instance
- Husky git hooks — need `pnpm prepare` to run after initial clone
- `packages/ui` — Populated starting Phase 1

---

## Non-Negotiables Status

| # | Rule | Status |
|---|------|--------|
| 1 | Double-entry ledger from line one | ✅ Schema + `postTransaction` — no balance columns |
| 2 | BigInt for all monetary amounts | ✅ `Money` class, BigInt throughout schema |
| 3 | Idempotency keys on every mutation | ✅ `Transaction.idempotencyKey` unique, checked in `postTransaction` |
| 4 | Provider abstraction for every external dep | ✅ `packages/providers` interfaces defined |
| 5 | Webhooks: verify → enqueue → return 200 | ✅ Worker process ready, pattern defined |
| 6 | Secrets never in git | ✅ `.gitignore` comprehensive, `.env.example` committed |
| 7 | Server is source of truth | ✅ Architectural pattern, enforced in Phase 1+ |
| 8 | KYC gates money movement | ✅ `KycTierLimit` table seeded, enforcement in Phase 2+ |
| 9 | Admin actions logged immutably | ✅ `AdminAuditLog` + Postgres trigger blocking UPDATE/DELETE |
| 11 | PII encrypted at field level | ✅ `packages/crypto` complete with tests |
| 12 | Webhooks rejected if > 5min old | ✅ Timestamp check pattern defined, implemented in Phase 4+ |
| 13 | Logs redacted by default | ✅ `packages/logger` with 30-key deny-list + tests |
| 14 | Rate limits: IP AND user dimension | ✅ Architecture defined, implementation Phase 10 |
| 15 | Segregation of duties | ✅ Schema support + enforcement Phase 11 |

---

## Tests That Pass

- `packages/crypto`: 1,000 random round-trip tests + tamper rejection tests
- `packages/ledger`: Money arithmetic property tests, ledger invariant tests
- `packages/logger`: Redaction unit tests for all 30 deny-list keys

Run: `pnpm test:unit`

---

## Next Phase

**Phase 1 — Identity, Auth, MFA, Device Trust**

Key work:
- Signup/login flows with email + phone OTP
- Redis sessions (iron-session), 15min idle / 12hr absolute
- TOTP enrollment + Passkeys (@simplewebauthn/server)
- Transaction PIN (Argon2id, 6-digit)
- Device fingerprinting + impossible-travel detection
- Rate limiting layer (Redis sliding window, IP + user dimensions)
- Account takeover recovery flow
- Session management page
- Panic freeze button
