/**
 * Bridge virtual card extensions — sits alongside packages/providers/src/bridge.ts
 * which handles customer creation and virtual bank account provisioning.
 *
 * Stub-mode behaviour enabled whenever BRIDGE_API_KEY is absent.
 *
 * Production URLs:
 *   POST /v0/customers/{id}/cards       — issue
 *   PATCH /v0/cards/{id}                — update limits / freeze / unfreeze / terminate
 *   GET  /v0/cards/{id}                 — fetch metadata
 *   POST /v0/cards/{id}/reveal          — short-lived reveal token for PAN/CVV fetch
 */

import { createHmac, randomBytes } from 'node:crypto';

const DEFAULT_BASE = 'https://api.bridge.xyz';

/** See bridge.ts — same policy, duplicated here so this file has no import cycle. */
function refuseStubInProduction(what: string): void {
  const env = process.env['NODE_ENV'];
  const allowDevStubs = process.env['FRENZPAY_ALLOW_DEV_STUBS'] === '1';
  if (env === 'production' && !allowDevStubs) {
    throw new Error(
      `[bridge] Missing BRIDGE_API_KEY in production — refusing to ${what}.`,
    );
  }
}

export interface BridgeCardIssueResult {
  cardId: string;
  last4: string;
  expiryMonth: number; // 1-12
  expiryYear: number;  // 4-digit year
  brand: 'Visa' | 'Mastercard';
  status: 'active' | 'frozen' | 'terminated';
  rawResponse?: unknown;
}

export interface BridgeRevealToken {
  /** Short-lived (typically 60 s) token the client exchanges for full PAN/CVV */
  token: string;
  expiresAt: Date;
}

interface BridgeCardClient {
  customerId: string;
  dailyLimitCents?: bigint;
  monthlyLimitCents?: bigint;
  /** Holder name embossed on the card (optional; Bridge defaults to customer name) */
  cardholderName?: string;
}

async function bridgeFetch<T>(
  path: string,
  init: RequestInit,
  apiKey: string,
  base: string,
): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bridge ${init.method ?? 'GET'} ${path}: HTTP ${res.status} — ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Stub helpers ────────────────────────────────────────────────────────────

function stubCard(customerId: string): BridgeCardIssueResult {
  const hash = createHmac('sha256', 'card-stub').update(customerId + Date.now()).digest('hex');
  const year = new Date().getFullYear() + 4;
  const month = (parseInt(hash.slice(0, 2), 16) % 12) + 1;
  return {
    cardId: `bridge_card_stub_${hash.slice(0, 12)}`,
    last4: hash.slice(-4).replace(/[a-f]/g, (c) => String((c.charCodeAt(0) - 87) % 10)),
    expiryMonth: month,
    expiryYear: year,
    brand: parseInt(hash.slice(0, 1), 16) > 7 ? 'Mastercard' : 'Visa',
    status: 'active',
    rawResponse: { stub: true },
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Issue a new virtual card for a Bridge customer. */
export async function issueBridgeCard(input: BridgeCardClient, idempotencyKey: string): Promise<BridgeCardIssueResult> {
  const apiKey = process.env['BRIDGE_API_KEY'];
  const base = process.env['BRIDGE_API_BASE'] ?? DEFAULT_BASE;

  if (!apiKey) {
    refuseStubInProduction('issue a stub virtual card');
    console.warn('[bridge] Missing BRIDGE_API_KEY — returning stub card');
    return stubCard(input.customerId);
  }

  const data = await bridgeFetch<{
    id: string;
    last_4: string;
    expiry_month: number;
    expiry_year: number;
    brand: string;
    status: string;
  }>(
    `/v0/customers/${input.customerId}/cards`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        type: 'virtual',
        daily_limit: input.dailyLimitCents ? Number(input.dailyLimitCents) : undefined,
        monthly_limit: input.monthlyLimitCents ? Number(input.monthlyLimitCents) : undefined,
        cardholder_name: input.cardholderName,
      }),
    },
    apiKey,
    base,
  );

  return {
    cardId: data.id,
    last4: data.last_4,
    expiryMonth: data.expiry_month,
    expiryYear: data.expiry_year,
    brand: (data.brand === 'mastercard' ? 'Mastercard' : 'Visa') as 'Visa' | 'Mastercard',
    status: data.status as 'active' | 'frozen' | 'terminated',
    rawResponse: data,
  };
}

/** Freeze an active card (reversible). */
export async function freezeBridgeCard(cardId: string): Promise<void> {
  const apiKey = process.env['BRIDGE_API_KEY'];
  const base = process.env['BRIDGE_API_BASE'] ?? DEFAULT_BASE;

  if (!apiKey) {
    refuseStubInProduction('no-op a freeze (card would remain active at Bridge)');
    console.warn('[bridge] Missing BRIDGE_API_KEY — freeze is a no-op in stub mode');
    return;
  }

  await bridgeFetch(
    `/v0/cards/${cardId}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'frozen' }) },
    apiKey,
    base,
  );
}

/** Unfreeze a frozen card (reversible). */
export async function unfreezeBridgeCard(cardId: string): Promise<void> {
  const apiKey = process.env['BRIDGE_API_KEY'];
  const base = process.env['BRIDGE_API_BASE'] ?? DEFAULT_BASE;

  if (!apiKey) {
    refuseStubInProduction('no-op an unfreeze (card would remain frozen at Bridge)');
    return;
  }

  await bridgeFetch(
    `/v0/cards/${cardId}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'active' }) },
    apiKey,
    base,
  );
}

/** Permanently terminate a card (NOT reversible). */
export async function terminateBridgeCard(cardId: string): Promise<void> {
  const apiKey = process.env['BRIDGE_API_KEY'];
  const base = process.env['BRIDGE_API_BASE'] ?? DEFAULT_BASE;

  if (!apiKey) {
    refuseStubInProduction('no-op a card termination (card would remain active at Bridge)');
    return;
  }

  await bridgeFetch(
    `/v0/cards/${cardId}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'terminated' }) },
    apiKey,
    base,
  );
}

/** Update spending limits on a card. */
export async function updateBridgeCardLimits(
  cardId: string,
  limits: { dailyCents?: bigint; monthlyCents?: bigint },
): Promise<void> {
  const apiKey = process.env['BRIDGE_API_KEY'];
  const base = process.env['BRIDGE_API_BASE'] ?? DEFAULT_BASE;

  if (!apiKey) {
    refuseStubInProduction('no-op a card-limit update');
    return;
  }

  await bridgeFetch(
    `/v0/cards/${cardId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        daily_limit: limits.dailyCents ? Number(limits.dailyCents) : null,
        monthly_limit: limits.monthlyCents ? Number(limits.monthlyCents) : null,
      }),
    },
    apiKey,
    base,
  );
}

/**
 * Create a short-lived "reveal token" that the client can exchange for the full
 * PAN + CVV. The token is single-use and expires in ~60 s.
 *
 * Security model:
 * - Reveal tokens are created server-side after re-authenticating the user (PIN step-up).
 * - A hash of the token is stored in the Card row so the server can validate rotation.
 * - The client never sees the raw PAN — Bridge serves it via a dedicated iframe/SDK
 *   using the token. In stub mode we return a fake token for parity.
 */
export async function createBridgeRevealToken(cardId: string): Promise<BridgeRevealToken> {
  const apiKey = process.env['BRIDGE_API_KEY'];
  const base = process.env['BRIDGE_API_BASE'] ?? DEFAULT_BASE;

  const expiresAt = new Date(Date.now() + 60_000);

  if (!apiKey) {
    refuseStubInProduction('return a stub PAN-reveal token');
    return { token: `rvl_stub_${randomBytes(16).toString('hex')}`, expiresAt };
  }

  const data = await bridgeFetch<{ token: string; expires_at: string }>(
    `/v0/cards/${cardId}/reveal`,
    { method: 'POST', body: JSON.stringify({}) },
    apiKey,
    base,
  );

  return {
    token: data.token,
    expiresAt: new Date(data.expires_at),
  };
}
