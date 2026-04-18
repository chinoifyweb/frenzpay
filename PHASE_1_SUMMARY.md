# Phase 1 Complete — Identity, Auth, MFA & Device Trust

**Date:** 2026-04-17  
**Test results:** 78/78 passing (auth 28, crypto 18, ledger 23, logger 9)  
**TypeScript:** 0 errors across apps/web

---

## What Was Built

### `packages/auth` — Auth Primitives

| Module | Exports |
|--------|---------|
| `index.ts` | `hashPassword`, `verifyPassword`, `hashPin`, `verifyPin`, `generateOtp`, `hashToken`, `generateSecureToken`, `timingSafeStringEqual` |
| `session.ts` | `sealSession`, `unsealSession`, `sessionCookieOptions`, `sessionRedisKey`, `userSessionsRedisKey`, `CookieSession`, `StoredSession`, `SESSION_COOKIE_NAME`, `IDLE_TTL_SECONDS` |
| `rate-limit.ts` | `checkRateLimit`, `checkAuthRateLimit`, `rateLimitHeaders` — atomic Lua sliding-window |
| `totp.ts` | `generateTotpSecret`, `verifyTotp`, `generateBackupCodes`, `verifyBackupCode` |

**Key decisions:**
- Switched `argon2` → `@node-rs/argon2 ^2.0.2` (prebuilt Win/Linux/Mac binaries, no compilation)
- `iron-session v8` for sealed cookie payloads (Ed25519 / AES-256-GCM, Web Crypto, Edge-compatible)
- Redis sliding-window rate limiter: Lua script atomically removes expired entries + counts + adds (no TOCTOU)
- TOTP: 160-bit secret, SHA-1, 6 digits, 30 s period, ±1 window
- Backup codes: 8 × 8-char alphanumeric (no 0/O/1/I/l), SHA-256 hashed, case-insensitive

### `apps/web/src/lib/redis.ts`
- Singleton `ioredis` client with exponential back-off reconnect
- Global `__redis` for Next.js hot-reload safety

### `apps/web/src/lib/session.ts`
- `createSession` — seals cookie + stores `StoredSession` in Redis (IDLE 15 min, absolute 12 hr)
- `getSession` / `requireSession` / `requireRole` — read + validate from Redis
- `deleteSession` / `deleteAllUserSessions` — panic freeze support
- `listUserSessions` — active sessions API

### `apps/web/src/middleware.ts` (Edge-safe rewrite)
- Imports `iron-session` directly (no workspace packages — Edge runtime safe)
- Guards: `/dashboard`, `/author`, `/settings`
- KYC T1 gate: `/dashboard/transfer`, `/withdraw`, `/send`, `/receive`
- KYC T2 gate: `/dashboard/cards`
- Admin gate: `/admin`
- Sets `x-user-id`, `x-user-role` response headers

### API Routes (`apps/web/src/app/api/auth/`)

| Route | Method | What it does |
|-------|--------|--------------|
| `signup` | POST | Rate-limit → Zod (E.164, 12+ char password, 4-class) → disposable email block (24 domains) → uniqueness → Argon2id hash → AES-GCM phone encrypt → DB transaction → send OTPs |
| `login` | POST | Constant-time lookup → device fingerprint → LoginAttempt record → MFA challenge → seal session |
| `logout` | POST | Redis delete + cookie clear |
| `me` | GET | Redis session → Prisma user |
| `verify-email` | POST | HMAC token verify → `User.emailVerified = true` |
| `verify-phone` | POST | Redis OTP verify → `User.phoneVerified = true` |
| `resend-otp` | POST | Rate-limited OTP re-send (email or phone) |
| `forgot-password` | POST | Rate-limited → signed reset token → email |
| `reset-password` | POST | Token verify → Argon2id rehash → invalidate all sessions |
| `mfa/totp-setup` | GET | Generate secret → QR URI → sealed pending key in Redis |
| `mfa/totp-setup` | POST | Verify TOTP against pending → persist `MfaMethod` + backup codes |
| `mfa/totp-verify` | POST | Challenge-mode: single-use Redis token → full session; account-mode: re-verify enrolled |
| `sessions` | GET | List all active sessions from Redis |
| `sessions` | DELETE | Revoke all sessions (except current) |
| `sessions/[sid]` | DELETE | Revoke single session by SID |
| `panic` | POST | Confirm password → freeze `User.status = 'frozen'` → delete all sessions → AuditLog |
| `pin` | POST | Set/verify PIN with lockout (5 failures → 15 min) |

### UI Pages (`apps/web/src/app/(auth)/`)
- **`signup/page.tsx`** — 3-step: form → email OTP (InputOTP, auto-submit) → phone OTP
- **`login/page.tsx`** — credentials + optional TOTP step (challengeToken flow)
- **`verify-email/page.tsx`** — static deep-link info page (no Supabase dependency)

### Monorepo Plumbing
- `next.config.ts` → `transpilePackages` for all `@frenzpay/*` workspace packages
- `apps/web/tsconfig.json` → `paths` mapping all packages to TypeScript source
- `packages/db/src/client.ts` → `require('@prisma/client')` with `any` types (pre-`prisma generate` stub)
- All `packages/*/package.json` → exports point to `./src/*.ts` source (TypeScript-first)
- `apps/{web,workers}/package.json` → `vitest run --passWithNoTests` (no test files yet)

---

## Pending (requires live infrastructure)
- `prisma generate` — needs `DATABASE_URL` pointing to a live PostgreSQL instance
- Redis connection — needs `REDIS_URL` in `.env.local`
- Email delivery — needs `RESEND_API_KEY` for OTP/reset emails
- `SESSION_SECRET` (32+ byte hex) in `.env.local`

---

## Next: Phase 2 — KYC & FrenzTag
