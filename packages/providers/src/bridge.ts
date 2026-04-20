/**
 * Bridge API client — USD virtual accounts for international users.
 * https://apidocs.bridge.xyz
 *
 * Required env vars:
 *   BRIDGE_API_KEY         — server-side API key
 *   BRIDGE_API_BASE        — defaults to https://api.bridge.xyz
 *   BRIDGE_WEBHOOK_SECRET  — HMAC-SHA256 secret for webhook verification
 *
 * When BRIDGE_API_KEY is missing, all methods return deterministic stub
 * responses suitable for local development.
 */

import { createHmac, createVerify, timingSafeEqual, randomBytes } from 'node:crypto';

const DEFAULT_BASE = 'https://api.bridge.xyz';

export interface BridgeCustomerPayload {
  /** User's email — Bridge uses this as the primary identifier */
  email: string;
  /** Legal first name (from KYC) */
  firstName: string;
  /** Legal last name (from KYC) */
  lastName: string;
  /** ISO-3166 alpha-2 country code (e.g. "NG") */
  country: string;
  /** YYYY-MM-DD */
  dateOfBirth?: string;
  /** Nigerian BVN as a cross-check (optional) */
  bvn?: string;
  /** Our internal user ID for idempotency */
  internalUserId: string;
}

export interface BridgeCustomerResult {
  customerId: string;
  status: 'active' | 'pending' | 'under_review' | 'rejected';
  rawResponse?: unknown;
}

export interface BridgeVirtualAccountResult {
  /** Bridge's ID for the virtual account */
  virtualAccountId: string;
  /** 9-digit US routing number */
  routingNumber: string;
  /** Account number (length varies by bank) */
  accountNumber: string;
  /** Holder name as it appears on the account */
  accountName: string;
  /** Custodian bank name (e.g. "Cross River Bank") */
  bankName: string;
  /** Currency that deposits convert to — typically USDC */
  settlementCurrency: 'USDC' | 'USD';
  rawResponse?: unknown;
}

export interface BridgeWebhookPayload {
  id: string;
  event_type: string;
  created_at: string;
  data: {
    virtual_account_id?: string;
    customer_id?: string;
    amount?: string;
    currency?: string;
    source?: {
      type: 'wire' | 'ach' | 'internal';
      sender_name?: string;
    };
    [key: string]: unknown;
  };
}

// ─── Production guard ────────────────────────────────────────────────────────

/**
 * Refuse to fall through to stubs in production. Stubbed Bridge responses
 * mean no real USD virtual account is created and no USDC actually moves —
 * looks fine in UI, catastrophic in prod. Set FRENZPAY_ALLOW_DEV_STUBS=1 to
 * explicitly opt in if you really know what you're doing.
 */
function refuseStubInProduction(what: string): void {
  const env = process.env['NODE_ENV'];
  const allowDevStubs = process.env['FRENZPAY_ALLOW_DEV_STUBS'] === '1';
  if (env === 'production' && !allowDevStubs) {
    throw new Error(
      `[bridge] Missing BRIDGE_API_KEY in production — refusing to ${what}. ` +
      `Set BRIDGE_API_KEY in /home/frenzpay/shared/.env.production.`,
    );
  }
}

// ─── Stub helpers (dev mode) ─────────────────────────────────────────────────

function stubCustomerId(internalUserId: string): string {
  return `bridge_cust_stub_${internalUserId.slice(0, 8)}`;
}

function stubVirtualAccount(customerId: string): BridgeVirtualAccountResult {
  // Deterministic routing based on customer id for test stability
  const hash = createHmac('sha256', 'stub').update(customerId).digest('hex');
  return {
    virtualAccountId: `bridge_va_stub_${hash.slice(0, 12)}`,
    routingNumber: '026073150',                              // Cross River Bank (real routing, stub acct)
    accountNumber: hash.slice(0, 10),
    accountName: 'FrenzPay (STUB)',
    bankName: 'Cross River Bank (DEV STUB)',
    settlementCurrency: 'USDC',
    rawResponse: { stub: true },
  };
}

// ─── Internal fetch helper ───────────────────────────────────────────────────

async function bridgeFetch<T>(
  path: string,
  init: RequestInit,
  apiKey: string,
  base: string,
): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bridge ${init.method ?? 'GET'} ${path} failed: HTTP ${res.status} — ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a Bridge customer from KYC data.
 * Idempotent — pass the same `internalUserId` to get the same customer back.
 */
export async function createBridgeCustomer(
  payload: BridgeCustomerPayload,
): Promise<BridgeCustomerResult> {
  const apiKey = process.env['BRIDGE_API_KEY'];
  const base = process.env['BRIDGE_API_BASE'] ?? DEFAULT_BASE;

  if (!apiKey) {
    refuseStubInProduction('return a stub Bridge customer (no KYC happened)');
    console.warn('[bridge] Missing BRIDGE_API_KEY — returning stub customer');
    return { customerId: stubCustomerId(payload.internalUserId), status: 'active', rawResponse: { stub: true } };
  }

  const data = await bridgeFetch<{
    id: string;
    status: 'active' | 'pending' | 'under_review' | 'rejected';
  }>(
    '/v0/customers',
    {
      method: 'POST',
      // Bridge requires an Idempotency-Key header on POSTs
      headers: { 'Idempotency-Key': `cust-${payload.internalUserId}` },
      body: JSON.stringify({
        type: 'individual',
        email: payload.email,
        first_name: payload.firstName,
        last_name: payload.lastName,
        residential_address: { country: payload.country },
        ...(payload.dateOfBirth ? { date_of_birth: payload.dateOfBirth } : {}),
      }),
    },
    apiKey,
    base,
  );

  return { customerId: data.id, status: data.status, rawResponse: data };
}

/**
 * Provision a virtual account (ACH + wire) for an existing Bridge customer.
 */
export async function createBridgeVirtualAccount(
  customerId: string,
  idempotencyKey: string,
): Promise<BridgeVirtualAccountResult> {
  const apiKey = process.env['BRIDGE_API_KEY'];
  const base = process.env['BRIDGE_API_BASE'] ?? DEFAULT_BASE;

  if (!apiKey) {
    refuseStubInProduction('return a stub virtual USD account');
    console.warn('[bridge] Missing BRIDGE_API_KEY — returning stub virtual account');
    return stubVirtualAccount(customerId);
  }

  const data = await bridgeFetch<{
    id: string;
    source_deposit_instructions: {
      bank_routing_number: string;
      bank_account_number: string;
      bank_name: string;
      bank_beneficiary_name: string;
    };
    destination: { currency: 'usdc' | 'usd' };
  }>(
    `/v0/customers/${customerId}/virtual_accounts`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        source: { currency: 'usd' },
        destination: { currency: 'usdc', payment_rail: 'ethereum' },
      }),
    },
    apiKey,
    base,
  );

  return {
    virtualAccountId: data.id,
    routingNumber: data.source_deposit_instructions.bank_routing_number,
    accountNumber: data.source_deposit_instructions.bank_account_number,
    accountName: data.source_deposit_instructions.bank_beneficiary_name,
    bankName: data.source_deposit_instructions.bank_name,
    settlementCurrency: (data.destination.currency.toUpperCase() as 'USDC' | 'USD'),
    rawResponse: data,
  };
}

/**
 * Fetch the current status of a virtual account (polling fallback for webhooks).
 */
export async function getBridgeVirtualAccount(
  customerId: string,
  virtualAccountId: string,
): Promise<unknown> {
  const apiKey = process.env['BRIDGE_API_KEY'];
  const base = process.env['BRIDGE_API_BASE'] ?? DEFAULT_BASE;

  if (!apiKey) {
    refuseStubInProduction('return a stub virtual-account status');
    return { stub: true, id: virtualAccountId };
  }

  return await bridgeFetch(
    `/v0/customers/${customerId}/virtual_accounts/${virtualAccountId}`,
    { method: 'GET' },
    apiKey,
    base,
  );
}

/**
 * Verify a Bridge webhook signature.
 * Bridge signs the raw request body with HMAC-SHA256(BRIDGE_WEBHOOK_SECRET).
 *
 * @param rawBody   Raw request body string (pre-JSON-parse)
 * @param signature Value from the `Bridge-Signature` header
 * @returns         true if the signature is valid
 */
/**
 * Verify a Bridge webhook signature.
 *
 * Bridge uses **RSA-SHA256** signing since their 2025 webhook revamp. The
 * dashboard exposes the public key as a PEM block under the webhook's
 * detail drawer. Paste the full PEM (BEGIN/END lines included) into
 * `BRIDGE_WEBHOOK_PUBLIC_KEY` in the server env — we don't touch the
 * customer's private key (Bridge holds it).
 *
 * The signature comes in as base64 on the `Webhook-Signature` header (some
 * older docs say `Bridge-Signature` / `X-Bridge-Signature` — accept all).
 *
 * For backwards compatibility we keep the old HMAC code path gated on
 * `BRIDGE_WEBHOOK_SECRET` being set; that branch is never hit in production
 * today but exists so an old test can still exercise the handler.
 */
export function verifyBridgeWebhookSignature(rawBody: string, signature: string): boolean {
  const publicKeyPem = process.env['BRIDGE_WEBHOOK_PUBLIC_KEY'];
  const hmacSecret = process.env['BRIDGE_WEBHOOK_SECRET'];

  // ── Preferred: RSA public-key verification ──────────────────────────────
  if (publicKeyPem) {
    if (!signature) return false;
    try {
      const verifier = createVerify('RSA-SHA256');
      verifier.update(rawBody, 'utf8');
      verifier.end();
      // Bridge base64-encodes the signature on the header. If a hex value ever
      // shows up, try both encodings.
      const sigBuf = signature.includes('=') || /^[A-Za-z0-9+/]+=*$/.test(signature)
        ? Buffer.from(signature, 'base64')
        : Buffer.from(signature, 'hex');
      return verifier.verify(publicKeyPem, sigBuf);
    } catch {
      return false;
    }
  }

  // ── Fallback: legacy HMAC verification (Bridge pre-2025 / test doubles) ─
  if (hmacSecret) {
    if (!signature) return false;
    const computed = createHmac('sha256', hmacSecret).update(rawBody, 'utf8').digest('hex');
    try {
      return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(signature, 'hex'));
    } catch {
      return false;
    }
  }

  // ── Neither configured: fail loud in production, permit in dev ──────────
  if (process.env['NODE_ENV'] === 'production') {
    console.warn('[bridge] No BRIDGE_WEBHOOK_PUBLIC_KEY or BRIDGE_WEBHOOK_SECRET set — rejecting webhook in production');
    return false;
  }
  console.warn('[bridge] No webhook keys set — allowing webhook in dev mode');
  return true;
}

/** Generate a unique idempotency key for a virtual-account provisioning request. */
export function generateBridgeIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(8).toString('hex')}`;
}
