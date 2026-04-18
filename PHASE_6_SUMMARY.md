# Phase 6 Complete — NGN Withdrawals via Paystack

**Date:** 2026-04-17
**Test results:** 99/99 passing (+ 11 new Paystack client tests)
**TypeScript:** 0 errors across apps/web

---

## What Was Built

### `packages/providers/src/paystack.ts` — New Module

Paystack API client for Nigerian bank transfers and payouts.

| Export | Description |
|--------|-------------|
| `listNigerianBanks()` | GET `/bank?country=nigeria` — returns `{ name, code, slug, active }[]` |
| `resolveNigerianAccount(accountNumber, bankCode)` | GET `/bank/resolve` — returns account holder name for confirmation |
| `createPaystackRecipient(name, bankCode, accountNumber)` | POST `/transferrecipient` — creates reusable recipient (stored on Beneficiary) |
| `initiatePaystackTransfer({ recipientCode, amountKobo, reference, reason })` | POST `/transfer` — starts payout, webhook confirms |
| `verifyPaystackWebhookSignature(rawBody, signature)` | HMAC-SHA512 verification with `timingSafeEqual` |

**Stub mode** (when `PAYSTACK_SECRET_KEY` is missing): returns 10 hardcoded Nigerian banks (Access, GTBank, Kuda, Opay, etc.), deterministic fake account names, and pending-status transfers so the full withdrawal flow works in local dev.

**11 new unit tests** — stub determinism, signature accept/reject, tamper rejection, environment-gated dev mode.

---

### `apps/web/src/lib/fx.ts` — FX Rate Helper

Clean primitives for currency conversion with BigInt math (no float loss):

| Function | Purpose |
|----------|---------|
| `getFxRateMicro(from, to)` | Returns `rate × 1e6` (env overrides via `FX_RATE_USD_NGN_MICRO`, etc.) |
| `getFxMarkupBps()` | Platform FX markup in basis points (default 150 bps = 1.5%) |
| `convertMinor({ sourceAmountMinor, from, to, markupBps })` | Applies marked-down rate, returns destination minor units |
| `getWithdrawalFeeMinor(currency)` | Flat fee per source currency |

Default rate: `1 USD = 1600 NGN` with 1.5% markup → effective `1576 NGN`.

---

### Schema Addition

**`PaystackWebhookEvent` model** — separate from `FlutterwaveWebhookEvent` so the two providers don't clash on event IDs. Primary key is `ps-{event}-{reference}`.

---

### API Routes (5 new)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/banks/ng` | GET | Lists Nigerian banks, cached 24 h in Redis |
| `/api/banks/resolve` | GET | Resolves `accountNumber + bankCode` → account holder name; rate-limited 10/min/user |
| `/api/withdrawals/ngn/quote` | POST | FX preview (fee + rate + NGN payout) without initiating |
| `/api/withdrawals/ngn` | POST | End-to-end withdrawal: PIN → KYC T2+ → balance → daily limit → name re-verify → recipient → ledger post → Paystack transfer |
| `/api/webhooks/paystack` | POST | Signature-verified, deduped via `PaystackWebhookEvent`, handles `transfer.success` / `failed` / `reversed` |

**`/api/withdrawals` GET** — replaced the legacy USDT withdrawal POST (raw-SQL, deprecated) with a paginated Prisma-based list of the user's withdrawals.

---

### Ledger Model for Withdrawals

Withdrawals span two currencies, so they post in **two legs**:

**Leg A — at initiation (posted synchronously):**
```
debit:  user.<sourceCurrency>.AVAILABLE    — fee
credit: fees_usd                           — platform fee revenue

debit:  user.<sourceCurrency>.AVAILABLE    — net amount
credit: fx_markup_usd                      — held pending payout settlement
```

**Leg B — on `transfer.success` webhook:**
```
debit:  paystack_ngn_float                 — NGN leaves our omnibus
credit: external_world_ngn                 — NGN settles to recipient bank
```

**On `transfer.failed` webhook:**
```
debit:  fees_usd                           — refund the fee
credit: user.<sourceCurrency>.AVAILABLE

debit:  fx_markup_usd                      — refund the net
credit: user.<sourceCurrency>.AVAILABLE
```

All legs are idempotent via distinct `idempotencyKey` values (`paystack-settle-{ref}`, `paystack-fail-refund-{ref}`). The `Withdrawal` row transitions `PROCESSING → SETTLED | FAILED | REFUNDED`.

---

### Security Checks in `/api/withdrawals/ngn`

Executed in order; each short-circuits on failure:

1. Zod validation
2. Idempotency (returns existing transaction if key seen)
3. PIN verification via `verifyUserPin` (5-fail/15-min lockout)
4. User is `ACTIVE`
5. KYC tier is T2 or T3 (withdrawals require document-verified KYC)
6. Sufficient `<source>.AVAILABLE` balance
7. Daily withdrawal limit from `KycTierLimit`
8. **Server-side re-resolution** of bank account (trust-but-verify — prevents tampered client input) with fuzzy name match
9. **Beneficiary cooling period** — new bank accounts wait 24 h before first use (T2 security requirement)
10. Amount > fee (no zero-payout)

AuditLog entries written at every state transition.

---

### UI

**`apps/web/src/app/dashboard/withdraw/page.tsx` — FULL REWRITE**
Replaced the legacy USDT/mock-data withdrawal with a 3-step NGN wizard:

1. **Destination** — Bank dropdown (from `/api/banks/ng`), 10-digit NUBAN input, debounced `/api/banks/resolve` call, green confirmation card with account name
2. **Amount** — Source currency picker (USD/USDC with available balances inline), amount input with symbol prefix, live FX quote card showing rate / fee / recipient gets
3. **PIN** — Full summary, masked 6-digit PIN input, submit with `idempotencyKey`
4. **Success** — Green badge, reference number, CTAs to "View activity" or "Done"

### Icons added to sidebar
(from Phase 5) — already includes `Send` and `ShieldCheck`. Withdraw uses existing `ArrowUpRight`.

---

## End-to-End Flow (happy path)

```
1. User (T2) clicks "Withdraw" on wallet                        (UI)
2. Selects bank + enters NUBAN → account resolves to real name  (/api/banks/resolve)
3. Enters $100 USD → sees quote "≈ ₦157,600"                    (/api/withdrawals/ngn/quote)
4. Enters PIN → submits                                          (/api/withdrawals/ngn)
5. Server: PIN verified, balance checked, Leg A posted          (@frenzpay/ledger)
6. Server: createPaystackRecipient + initiatePaystackTransfer   (@frenzpay/providers/paystack)
7. User sees "Processing" status                                 (UI)
8. ~10s later: Paystack webhook "transfer.success"              (/api/webhooks/paystack)
9. Signature verified, event deduped                             (PaystackWebhookEvent)
10. Leg B posted: paystack_ngn_float → external_world_ngn       (@frenzpay/ledger)
11. Withdrawal.status = SETTLED                                  (DB)
12. Recipient bank shows ₦157,600 credit                         (external)
```

---

## Environment Variables (Phase 6 additions)

```env
PAYSTACK_SECRET_KEY=sk_test_xxx        # required in production
PAYSTACK_API_BASE=https://api.paystack.co  # override for sandbox

# Optional FX overrides (micro-units — 1 USD = 1600 NGN → 1600000000):
FX_RATE_USD_NGN_MICRO=1600000000
FX_RATE_USDC_NGN_MICRO=1600000000
FX_MARKUP_BPS=150                      # default 1.5%

# Optional fee overrides (minor units):
WITHDRAWAL_FEE_USD_MINOR=200           # $2
WITHDRAWAL_FEE_USDC_MINOR=2000000      # 2 USDC
WITHDRAWAL_FEE_NGN_MINOR=50000         # ₦500
```

---

## Next Phases Available
- **Phase 7** — Virtual cards (Bridge card issuance, PAN/CVV reveal UI, freeze/unfreeze, transaction authorization)
- **Phase 8** — Savings locks (user-chosen lock periods, early-break fee, scheduled unlock)
