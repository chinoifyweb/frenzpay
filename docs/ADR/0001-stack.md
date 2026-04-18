# ADR 0001 — Technology Stack

**Status:** Accepted  
**Date:** 2026-04-17  
**Author:** Arthur (Chinoify), CEO, Frenz LLC

---

## Context

FrenzPay is a cross-border payment platform for the African diaspora (initially Nigerian freelancers receiving USD from global clients). We need to ship a production-grade, regulator-ready web application that stands in for native Android/iOS apps during App Store review.

The platform must be:
- **Financially sound**: double-entry accounting, BigInt amounts, no rounding errors
- **Regulator-ready**: FinCEN MSB compliance, KYC/AML, immutable audit logs, PII encryption
- **Operationally resilient**: zero-downtime deploys, async webhook processing, daily backups
- **Developer-friendly**: single-language stack, type-safe end-to-end

---

## Decision

### Runtime & Framework
- **Node.js 22 LTS** — Long-term support, stable performance, single language across the stack.
- **Next.js 15 (App Router)** — Server Components for SSR/SEO, Server Actions for form handling, Route Handlers for public APIs and webhooks.
- **TypeScript strict mode** — No implicit `any`. Type safety is non-negotiable for financial code.

### Monorepo
- **pnpm workspaces** — Fast installs, proper hoisting, workspace protocol for internal packages.
- Structure: `apps/web`, `apps/admin`, `apps/workers`, `packages/db`, `packages/ledger`, `packages/crypto`, `packages/logger`, `packages/providers`, `packages/auth`, `packages/validators`, `packages/events`, `packages/ui`.

### Database & ORM
- **PostgreSQL 16** — ACID guarantees, row-level locking, triggers for immutability. CyberPanel ships MariaDB but we install PG16 from PGDG for financial data.
- **Prisma** — Type-safe queries, migration management, relation awareness.
- **No Supabase** — Previous version used Supabase. Replaced with direct PG16 + self-managed backups for full control over data residency (NDPR compliance for Nigerian user data).

### Caching & Queues
- **Redis 7 + ioredis** — Sessions, rate limiting (sliding window), idempotency keys.
- **BullMQ** — Webhook processing, NGN payout jobs, reconciliation, email/SMS notifications, savings lock maturity. All async — webhook handlers return 200 in < 200ms.

### Authentication
- **Custom sessions** (iron-session, Redis) — Not NextAuth. Gives us full control over session lifecycle, device trust, and the impossible-travel detection required by compliance.
- **TOTP MFA** via `otpauth` + **Passkeys** via `@simplewebauthn/server`.
- **Transaction PIN** separate from password (Argon2id hashed).

### Money Math
- **BigInt throughout** — All monetary amounts stored as BigInt in smallest currency unit (cents, kobo, microUSDC). No `Decimal`, no `Float`, no string concatenation.
- Custom `Money` class in `packages/ledger` wraps BigInt with currency-aware arithmetic.

### Payments
- **Bridge** (bridge.xyz) — USD virtual accounts, ACH/wire receipt, virtual cards.
- **Flutterwave** — NGN bank payouts (NUBAN resolution, transfers).
- **NOT Paystack** — Previous iteration used Paystack. Replaced with Bridge (for USD virtual accounts) + Flutterwave (for NGN disbursements) to align with the actual product flow.

### KYC
- **Dojah** — BVN verification + liveness detection for Nigerian users. Manual review queue for Tier 3.

### Infrastructure
- **Hetzner CX22 → CPX31** — Self-hosted on German VPS. EU data center noted in NDPR transfer basis.
- **CyberPanel / OpenLiteSpeed** — Existing setup. Node.js via PM2, reverse-proxied through OLS.
- **Cloudflare** — WAF, DDoS protection, Cloudflare Access for admin panel.
- **Infisical** (self-hosted on separate CX11) — KMS for production secrets. App never reads `.env` in production.

### Security
- **Envelope encryption** (`packages/crypto`) — AES-256-GCM for PII fields, DEKs wrapped with KEK from Infisical. Blind indexes (HMAC-SHA-256) for equality lookups.
- **Immutable ledger** — Postgres trigger blocks UPDATE/DELETE on `ledger_entries`.
- **Immutable audit logs** — Same trigger pattern on `admin_audit_logs`.

---

## Alternatives Considered

| Option | Rejected Because |
|--------|-----------------|
| Supabase Auth | Loses control over session lifecycle, device trust, impossible-travel detection |
| Stripe | Not optimised for Nigeria; would require Paystack anyway for NGN |
| Prisma Accelerate | External connection pooler adds latency and data-residency concerns |
| tRPC | Good DX but adds learning curve; Server Actions achieve the same type-safety |
| Turborepo | Added complexity; pnpm workspaces + `pnpm -r` is sufficient for this team size |

---

## Consequences

- All new features must use `packages/ledger` for money movement — no direct SQL balance updates.
- Provider interfaces must be respected — swapping Bridge for a competitor is a one-file change.
- Every PR must pass the secret scanner (TruffleHog + gitleaks) before merge.
