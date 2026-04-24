/**
 * Graph API client — Nigerian + African fiat rails.
 * https://usegraph.readme.io/
 *
 * Graph accepts USD / EUR inbound and settles to **NGN** (direct Nigerian
 * bank deposit), whereas Bridge settles the same currencies to USDC. The
 * two providers run in parallel — customers pick per rail.
 *
 * Endpoints used:
 *   POST  /v1/people                          — create an individual entity
 *   POST  /v1/people/{id}/kyc                 — upgrade KYC tier (optional;
 *                                                we can mark verified via our
 *                                                own internal review)
 *   POST  /v1/bank-accounts                   — issue a virtual bank account
 *   POST  /v1/cards                           — issue a virtual card
 *   POST  /v1/payouts                         — initiate a payout
 *   GET   /v1/rates                           — FX quote
 *
 * Auth:       Authorization: Bearer {GRAPH_API_KEY}
 * Base URL:   https://api.useoval.com          (sandbox and prod use the same
 *                                                host — the API key determines
 *                                                the environment)
 * Webhooks:   Signing scheme not documented publicly. We default to
 *             HMAC-SHA256 with GRAPH_WEBHOOK_SECRET and read the signature
 *             from standard header names. Upgrade verifyGraphWebhookSignature
 *             once the actual scheme is confirmed from the Graph dashboard.
 *
 * Stub mode (when GRAPH_API_KEY is missing): returns deterministic fixtures
 * so local dev works. Refused in production via refuseStubInProduction.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const DEFAULT_BASE = 'https://api.useoval.com';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GraphPersonPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth?: string;           // YYYY-MM-DD
  /** ISO 3166-1 alpha-2, e.g. "NG" */
  country: string;
  /** Our internal user id — used as the idempotency key on Graph's side */
  internalUserId: string;
  /** Optional pre-verified KYC tier we want to assert against Graph (if the
   *  endpoint accepts it — otherwise we leave Graph to run their own flow) */
  kycTier?: 'tier1' | 'tier2' | 'tier3';
}

export interface GraphPersonResult {
  personId: string;
  status: 'active' | 'pending' | 'under_review' | 'rejected';
  rawResponse?: unknown;
}

export interface GraphBankAccountResult {
  bankAccountId: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  bankCode?: string;
  /** User-facing inbound currency (USD, EUR, NGN) */
  currency: string;
  /** Where deposits settle on our side (NGN for Graph rails) */
  settlementCurrency: string;
  rawResponse?: unknown;
}

export interface GraphCardResult {
  cardId: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  brand: 'Visa' | 'Mastercard' | string;
  status: 'active' | 'frozen' | 'closed' | string;
  rawResponse?: unknown;
}

export interface GraphWebhookEnvelope {
  event_type: string;
  entity: Record<string, unknown> & { id?: string };
  data: Record<string, unknown>;
}

// ─── Production guard + stub helpers ────────────────────────────────────────

function refuseStubInProduction(what: string): void {
  const env = process.env['NODE_ENV'];
  const allowDevStubs = process.env['FRENZPAY_ALLOW_DEV_STUBS'] === '1';
  if (env === 'production' && !allowDevStubs) {
    throw new Error(
      `[graph] Missing GRAPH_API_KEY in production — refusing to ${what}. ` +
      `Set GRAPH_API_KEY via /admin/providers or in /home/frenzpay/shared/.env.production.`,
    );
  }
}

function stubPersonId(userId: string): string {
  return `graph_pers_stub_${userId.slice(0, 10)}`;
}

function stubBankAccount(personId: string, currency: string): GraphBankAccountResult {
  const hash = createHmac('sha256', 'graph-stub').update(personId + currency).digest('hex');
  return {
    bankAccountId: `graph_ba_stub_${hash.slice(0, 12)}`,
    accountNumber: hash.slice(0, 10).replace(/[a-f]/g, '0'),
    accountName: 'FRENZPAY / STUB',
    bankName: 'Stub Nigerian Bank',
    bankCode: '000',
    currency,
    settlementCurrency: 'NGN',
    rawResponse: { stub: true },
  };
}

// ─── Internal fetch helper ──────────────────────────────────────────────────

async function graphFetch<T>(
  path: string,
  init: RequestInit,
  apiKey: string,
  base: string,
): Promise<T> {
  const url = `${base}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Graph ${init.method ?? 'GET'} ${path} failed: HTTP ${res.status} — ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Create a Person entity on Graph (individual customer). */
export async function createGraphPerson(payload: GraphPersonPayload): Promise<GraphPersonResult> {
  const apiKey = process.env['GRAPH_API_KEY'];
  const base = process.env['GRAPH_API_BASE'] ?? DEFAULT_BASE;

  if (!apiKey) {
    refuseStubInProduction('return a stub Graph person (no compliance record created)');
    console.warn('[graph] Missing GRAPH_API_KEY — returning stub person');
    return {
      personId: stubPersonId(payload.internalUserId),
      status: 'active',
      rawResponse: { stub: true },
    };
  }

  // The exact endpoint path is docs-dependent; the readme TOC lists "People"
  // under Core API so we assume /v1/people. Once we confirm from live docs,
  // adjust here. The idempotency key maps to our internalUserId so a repeat
  // create returns the existing record.
  const data = await graphFetch<{
    id: string;
    status: 'active' | 'pending' | 'under_review' | 'rejected';
  }>(
    '/v1/people',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': `pers-${payload.internalUserId}` },
      body: JSON.stringify({
        first_name: payload.firstName,
        last_name: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        date_of_birth: payload.dateOfBirth,
        country: payload.country,
        ...(payload.kycTier ? { kyc_tier: payload.kycTier } : {}),
      }),
    },
    apiKey,
    base,
  );

  return { personId: data.id, status: data.status, rawResponse: data };
}

/**
 * Issue a Graph virtual bank account for the given person + activation
 * currency (USD or EUR in-bound; NGN settlement).
 */
export async function createGraphBankAccount(
  personId: string,
  activationCurrency: 'USD' | 'EUR',
  idempotencyKey: string,
): Promise<GraphBankAccountResult> {
  const apiKey = process.env['GRAPH_API_KEY'];
  const base = process.env['GRAPH_API_BASE'] ?? DEFAULT_BASE;

  if (!apiKey) {
    refuseStubInProduction('return a stub Graph bank account');
    console.warn('[graph] Missing GRAPH_API_KEY — returning stub bank account');
    return stubBankAccount(personId, activationCurrency);
  }

  const data = await graphFetch<{
    id: string;
    account_number: string;
    account_name: string;
    bank_name: string;
    bank_code?: string;
    currency: string;
    settlement_currency?: string;
  }>(
    '/v1/bank-accounts',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        person_id: personId,
        currency: activationCurrency,
        // Explicitly ask Graph to settle deposits in NGN; if a future rail
        // supports USD settlement too we can vary this parameter.
        settlement_currency: 'NGN',
      }),
    },
    apiKey,
    base,
  );

  return {
    bankAccountId: data.id,
    accountNumber: data.account_number,
    accountName: data.account_name,
    bankName: data.bank_name,
    bankCode: data.bank_code,
    currency: data.currency,
    settlementCurrency: data.settlement_currency ?? 'NGN',
    rawResponse: data,
  };
}

/**
 * Verify a Graph webhook signature.
 *
 * The exact signing scheme is not documented in the public readme pages —
 * we'll need the answer from the Graph dashboard. Until then this function
 * tries, in order:
 *   1. HMAC-SHA256 against GRAPH_WEBHOOK_SECRET if the signature looks hex or
 *      base64 (most common pattern)
 *   2. If neither env is configured, reject in production and permit in dev
 *
 * Once we know the true scheme we switch on the right one. The function
 * signature is intentionally the same as the Bridge equivalent so the
 * webhook route doesn't need to branch.
 */
export function verifyGraphWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env['GRAPH_WEBHOOK_SECRET'];

  if (secret) {
    if (!signature) return false;

    // Try HMAC-SHA256 first — it's the most common scheme for BaaS providers.
    const computedHex = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    const computedB64 = Buffer.from(computedHex, 'hex').toString('base64');

    // Normalise the incoming signature — some providers prefix with
    // "sha256=" (Stripe-style), and the encoding may be hex or base64.
    const sig = signature.replace(/^sha256=/i, '').trim();

    try {
      if (sig.length === computedHex.length && /^[0-9a-fA-F]+$/.test(sig)) {
        return timingSafeEqual(Buffer.from(computedHex, 'hex'), Buffer.from(sig, 'hex'));
      }
      if (sig === computedB64) return true;
      // Last attempt — some providers send raw bytes; try a byte comparison
      const a = Buffer.from(sig, 'base64');
      const b = Buffer.from(computedB64, 'base64');
      if (a.length === b.length) return timingSafeEqual(a, b);
    } catch {
      /* fall through */
    }
    return false;
  }

  // No secret configured — fail loud in production, permit in dev.
  if (process.env['NODE_ENV'] === 'production') {
    console.warn('[graph] GRAPH_WEBHOOK_SECRET missing — rejecting webhook in production');
    return false;
  }
  console.warn('[graph] GRAPH_WEBHOOK_SECRET missing — allowing webhook in dev mode');
  return true;
}

/** Generate a unique idempotency key for Graph POSTs. */
export function generateGraphIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(8).toString('hex')}`;
}
