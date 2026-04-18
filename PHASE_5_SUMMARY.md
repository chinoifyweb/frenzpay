# Phase 5 Complete — P2P Transfers via FrenzTag

**Date:** 2026-04-17
**Test results:** 88/88 passing
**TypeScript:** 0 errors across apps/web

---

## What Was Built

### Shared helper: `apps/web/src/lib/pin.ts`
Extracted the PIN verification + lockout logic from the `/api/auth/pin` route into a reusable helper so every money-movement endpoint can enforce step-up PIN auth consistently.

| Function | Behaviour |
|----------|-----------|
| `verifyUserPin(userId, pin)` | Returns `{ ok: true }` or `{ ok: false, status, error, attemptsRemaining? }`. Auto-locks for 15 min after 5 consecutive failures. Resets failure counter on success. |

---

### API Routes (2 new)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/frenz-tag/lookup` | GET | Returns minimum recipient info (display name + verified badge) for send confirmation. Blocks self-lookup (409) and inactive recipients (410). |
| `/api/p2p/send` | POST | End-to-end money movement: PIN verify → recipient lookup → balance check → daily P2P limit check → atomic ledger post + P2PTransfer row + AuditLog |

**`/api/p2p/send` request body**
```json
{
  "recipientTag": "janedoe",
  "amountMinor": "50000",          // BigInt string, minor units
  "currency": "USD",
  "pin": "123456",
  "note": "rent",                   // optional
  "idempotencyKey": "uuid-v4"       // client-generated, per-attempt
}
```

**Checks (in order):**
1. Zod validation
2. FrenzTag format (`validateFrenzTag`)
3. Idempotency — if `idempotencyKey` already used, returns the existing transaction (safe retry)
4. PIN verification via `verifyUserPin`
5. Sender is T1+ and `ACTIVE`
6. Recipient exists, is T1+, is `ACTIVE`, is not self
7. Sender has sufficient `<currency>.AVAILABLE` balance
8. Sender hasn't exceeded daily P2P send limit for their tier (`KycTierLimit.p2pSendLimitDailyCents`)

**Atomic transaction:**
```
debit:  sender.<currency>.AVAILABLE
credit: recipient.<currency>.AVAILABLE
+ P2PTransfer row linked to Transaction
+ AuditLog entry
```

All wrapped inside a single Prisma `$transaction` — either every write lands, or none of them do.

---

### UI

**`apps/web/src/app/dashboard/send/page.tsx` — NEW (3-step wizard)**

1. **Recipient step** — `@`-prefixed FrenzTag input with debounced lookup (400 ms). Shows a recipient card with display name, blue verified badge, and a green check when found. Rejects self, inactive accounts, malformed tags.

2. **Amount step** — Currency selector (shows available balance inline in each option), amount input with symbol prefix, optional note (200-char max). Client-side `displayToMinor()` converts "12.50" → "1250" BigInt minor units without floating-point. Inline error when amount > available.

3. **PIN step** — Summary panel (to/amount/note), 6-digit masked PIN input with `inputMode="numeric"`, submit with `idempotencyKey` generated once per attempt (so "retry same send" is safe).

4. **Success** — Green check icon, recipient summary, `@tag` badge, truncated transaction ID. Two CTAs: "View activity" and "Send another" (resets the whole form).

Step progress stepper with filled/current/upcoming states.

### Sidebar
Added `Send` entry to `NAV_ITEMS.dashboard`. Imported `Send` + `ShieldCheck` into the sidebar's icon map so both new nav items render correctly.

### Wallet page integration
The wallet card's **Send** button now routes to `/dashboard/send?currency=X` (previously a placeholder).

---

## Security Model

- **FrenzTag lookup requires auth.** Enumeration of taken handles is possible but is logged against the authenticated user's session and rate-limited at the middleware layer.
- **Minimum info leaked on lookup.** Only FrenzTag, display name (first + last initial), and verified badge. No email, phone, tier, balance, or full last name exposed.
- **PIN lockout enforced server-side.** 5 consecutive wrong PINs → 15-minute lockout. Reset on success.
- **Daily P2P limits enforced by KYC tier.** T1: $200/day, T2: $2,000/day, T3: $20,000/day (from `KycTierLimit`).
- **Idempotency keys are UUIDs.** Client generates one per send attempt; server returns the existing transaction if the same key is retried. Prevents duplicate charges on network flakiness.
- **AuditLog** entry written for every send with sender, recipient, amount, currency.

---

## Next Phases Available
- **Phase 6** — NGN withdrawals via Paystack (bank list, account resolution, payout API, webhook)
- **Phase 7** — Virtual cards (Bridge card issuance, PAN/CVV reveal, freeze/unfreeze, transaction auth)
- **Phase 8** — Savings locks (user-chosen lock period, early-break fee, unlock flow)
