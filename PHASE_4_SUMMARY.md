# Phase 4 Complete — Bridge USD Virtual Accounts

**Date:** 2026-04-17
**Test results:** 88/88 passing (+ 10 new Bridge client tests)
**TypeScript:** 0 errors across apps/web

---

## What Was Built

### `packages/providers/src/bridge.ts` — New Module

Bridge API client for provisioning US virtual bank accounts.

| Export | Description |
|--------|-------------|
| `createBridgeCustomer(payload)` | POST `/v0/customers` with idempotency key — returns customerId + KYC status |
| `createBridgeVirtualAccount(customerId, idempotencyKey)` | POST `/v0/customers/{id}/virtual_accounts` — returns routing + account + bank |
| `getBridgeVirtualAccount(customerId, vaId)` | GET for polling fallback |
| `verifyBridgeWebhookSignature(rawBody, signature)` | HMAC-SHA256 + `timingSafeEqual` — rejects tampered bodies |
| `generateBridgeIdempotencyKey(prefix)` | Timestamped idempotency keys |

**Key design decisions:**
- **Stub mode** when `BRIDGE_API_KEY` is absent — every method returns deterministic fake data based on the `internalUserId`. Enables full end-to-end dev testing without a live Bridge sandbox.
- **Settlement currency = USDC** — deposits auto-convert, arriving as USDC in our `bridge_usd_omnibus` account.
- **Idempotency on POST** via `Idempotency-Key` header — safe to retry.
- Webhook secret **required in production** — dev mode allows unsigned webhooks (explicit env-aware branch).

### Unit tests (10 new, all passing)
`bridge.test.ts` covers stub-mode determinism, webhook signature accept/reject, tamper rejection, missing-secret dev-vs-prod behaviour, and idempotency key uniqueness.

---

### API Routes (3 new)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/accounts/usd` | GET | Returns the user's virtual account details (routing/account/bank) if provisioned |
| `/api/accounts/usd/provision` | POST | T2+ gated; creates Bridge customer + virtual account; idempotent |
| `/api/webhooks/bridge` | POST | Signature-verified, dedupe-via-`BridgeWebhookEvent`, dispatches to handlers |

**Webhook handlers:**
- `virtual_account.activity.created` → posts ledger transaction (debit: `bridge_usd_omnibus`, credit: user's `USDC.AVAILABLE`), idempotent via `externalRef = event.id`
- `virtual_account.status.updated` → updates `UserExternalAccount.status`
- `customer.status.updated` → updates Bridge customer row status

**Security:**
- All webhooks pass through `verifyBridgeWebhookSignature()` before any side effect
- `BridgeWebhookEvent` row is created BEFORE processing; `processedAt` set only on success — failed events remain for manual replay
- Failed processing returns 500 so Bridge retries

---

### UI

**`apps/web/src/app/dashboard/wallet/receive/page.tsx` — NEW**
- Dedicated Receive USD page routed from wallet cards' "Add funds" button
- Empty state: "Request USD bank account" CTA with benefit checklist
- Provisioned state: four `CopyField` components (holder, account #, routing #, bank name) with clipboard + toast feedback
- KYC block banner: if 403 received with "Upgrade required", shows `ShieldAlert` alert + "Go to KYC" button
- Non-USD currencies fall through to a "Coming soon" placeholder

**Wallet page update**
- `onAddFunds` callback now routes to `/dashboard/wallet/receive?currency=X` instead of the placeholder `add-funds`

---

## Deposit Flow (End-to-End)

```
1. User (T2) clicks "Request USD account"                         (UI)
2. POST /api/accounts/usd/provision                               (apps/web)
3. → createBridgeCustomer()                                       (@frenzpay/providers/bridge)
4. → createBridgeVirtualAccount()                                 (@frenzpay/providers/bridge)
5. UserExternalAccount rows written + AuditLog                    (DB)
6. User shares routing + account # with client                    (manual)
7. Client sends $500 via ACH                                      (external)
8. Bridge settles → converts to USDC                              (external)
9. POST /api/webhooks/bridge                                      (apps/web)
10. Signature verified + BridgeWebhookEvent dedupe                 (apps/web)
11. postTransaction() — DEPOSIT type, atomic                       (@frenzpay/ledger)
    lines: [{ debit: bridge_usd_omnibus, credit: user.USDC.AVAILABLE, amount: 500 USDC }]
12. User sees +500 USDC in /dashboard/wallet                       (UI)
13. Activity row appears in /dashboard/activity                    (UI)
```

---

## Environment Variables (Phase 4 additions)

```env
BRIDGE_API_KEY=            # Bridge server-side API key (required in prod)
BRIDGE_API_BASE=https://api.bridge.xyz  # override for sandbox
BRIDGE_WEBHOOK_SECRET=     # HMAC-SHA256 secret — required in production
```

---

## Next: Phase 5 — P2P Transfers
FrenzTag lookup (`/api/frenz-tag/lookup?tag=xxx`), send/receive flow, money-request feature, recipient confirmation UI.
