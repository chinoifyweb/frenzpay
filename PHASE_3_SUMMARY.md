# Phase 3 Complete — Ledger Core & Accounts

**Date:** 2026-04-17
**Test results:** 78/78 passing (auth 28, crypto 18, ledger 23, logger 9)
**TypeScript:** 0 errors across apps/web

---

## What Was Built

### `packages/ledger` — New Helpers

Added to `post-transaction.ts` (alongside existing `postTransaction`, `balanceOf`, `ensureAccount`, `getSystemAccount`, `hold`, `release`):

| Export | Description |
|--------|-------------|
| `listUserAccounts(prisma, userId)` | Returns all of a user's accounts with live balances computed from the ledger |
| `provisionUserAccounts(prisma, userId, currencies[])` | Idempotent batch-create of AVAILABLE accounts for a user |

**Ledger invariants (unchanged from Phase 0):**
- Double-entry: every line has both a debit and credit account, same amount, same currency
- Balance = `SUM(credits) - SUM(debits)` per account — never a stored column
- `postTransaction` is atomic via `$transaction` + unique `idempotencyKey` guards duplicates
- `LedgerEntry` rows are immutable (Postgres trigger blocks UPDATE/DELETE)

---

### System Accounts — Seed Additions

`packages/db/prisma/seed.ts` — added missing system accounts:

| Name | Currency | Purpose |
|------|----------|---------|
| `paystack_ngn_float` | NGN | Paystack NGN omnibus for Nigerian deposits/payouts |
| `suspense_ngn` | NGN | Unassigned NGN incoming funds |
| `external_world_usd` | USD | Balancing side of USD deposits/withdrawals |
| `external_world_ngn` | NGN | Balancing side of NGN flows |
| `external_world_usdc` | USDC | Balancing side of USDC flows |

---

### API Routes (4 new)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/accounts` | GET | Returns user's accounts grouped by currency + available totals |
| `/api/accounts/provision` | POST | Creates USD/NGN/USDC AVAILABLE accounts (T1+ gated) |
| `/api/transactions` | GET | Paginated history with `type`, `currency`, `page`, `limit` filters; direction computed per user |
| `/api/dev/deposit-simulate` | POST | DEV + admin only — credits a user from `external_world_*` system account (bypasses real provider integrations) |

**Security gates:**
- `/api/accounts/provision` blocks T0 users ("Complete KYC first")
- `/api/dev/deposit-simulate` blocks `NODE_ENV=production` AND requires `role === 'admin'`
- All mutations write `AuditLog` entries

---

### UI Pages

**`apps/web/src/app/dashboard/wallet/page.tsx`**
- Three large balance cards (USD / NGN / USDC) with gradient backgrounds
- Per-currency secondary breakdown (PENDING, HOLD, LOCKED) when non-zero
- BigInt-safe `formatMinor()` helper — USD cents → `$X.XX`, NGN kobo → `₦X,XXX.XX`, USDC 6-decimal → `X.XXXXXX USDC`
- Empty state with "Activate wallet" CTA → `POST /api/accounts/provision`
- Skeleton loading, alert-based error with retry
- Refresh button

**`apps/web/src/app/dashboard/activity/page.tsx`**
- Transaction table: Date (relative via `date-fns`), Type (with icon + color), Direction (↓ in / ↑ out / ↔ internal), Amount, Status badge, Reference
- Filter bar: type (All, Deposit, Withdrawal, P2P, FX, Refund), currency (All, USD, NGN, USDC)
- Pagination (prev/next with page count)
- Empty state, error state, skeleton rows while loading

### Sidebar Navigation
Updated `NAV_ITEMS.dashboard` in `lib/constants.ts`:
- Replaced `Accounts → /dashboard/accounts` with `Wallet → /dashboard/wallet`
- Replaced `Transactions → /dashboard/transactions` with `Activity → /dashboard/activity`
- Added `KYC → /dashboard/kyc`

---

### TypeScript Plumbing Fixes
- Added `TransactionType` union type to `packages/db/src/client.ts` (dev stub) so `@frenzpay/ledger` compiles without real Prisma generate
- Changed ledger's `PrismaClient` type import to `PrismaClientInstance as PrismaClient` for compatibility with the `any`-typed stub
- Cast `_sum.amount` returns to `bigint | null` for clean subtraction

---

## Deposit Flow (Internal Ledger View)

```
External deposit from Bridge/Paystack →
  debit: external_world_<currency>  (+$100 leaves "outside")
  credit: user.<currency>.AVAILABLE  (+$100 lands in user wallet)

User withdrawal →
  debit: user.<currency>.AVAILABLE  (-$100 leaves wallet)
  credit: external_world_<currency>  (-$100 goes back "outside")

Fee collection →
  debit: user.<currency>.AVAILABLE  ($2 fee out of user)
  credit: fees_<currency>            ($2 into platform fees)
```

Every operation balances within each currency. `$transaction` wraps the entire posting so ledger rows are never persisted without their matching transaction row.

---

## Next: Phase 4 — Bridge USD Virtual Accounts
Provisioning real-world USD receiving accounts (ACH + wire) via Bridge, webhook handlers for incoming deposits that automatically credit user's USDC AVAILABLE account.
