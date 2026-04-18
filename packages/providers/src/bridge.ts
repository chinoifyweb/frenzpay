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

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

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
export function verifyBridgeWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env['BRIDGE_WEBHOOK_SECRET'];
  if (!secret) {
    console.warn('[bridge] BRIDGE_WEBHOOK_SECRET missing — allowing webhook in dev mode');
    return process.env['NODE_ENV'] !== 'production';
  }
  if (!signature) return false;

  const computed = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  try {
    return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

/** Generate a unique idempotency key for a virtual-account provisioning request. */
export function generateBridgeIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(8).toString('hex')}`;
}
