/**
 * Paystack API client — Nigerian bank transfers and payouts.
 * https://paystack.com/docs/api
 *
 * Required env vars:
 *   PAYSTACK_SECRET_KEY    — sk_test_xxx or sk_live_xxx
 *   PAYSTACK_WEBHOOK_SECRET — HMAC-SHA512 secret for webhook verification
 *
 * Stub mode (when PAYSTACK_SECRET_KEY is missing) returns deterministic
 * fixtures so the full withdrawal flow works end-to-end in local dev.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_BASE = 'https://api.paystack.co';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PaystackBank {
  name: string;
  code: string;      // e.g. "058"
  longcode?: string; // sort/SWIFT-ish
  country: string;   // "Nigeria"
  currency: string;  // "NGN"
  slug?: string;
  active: boolean;
}

export interface PaystackAccountResolution {
  accountNumber: string;
  accountName: string;
  bankCode: string;
}

export interface PaystackTransferRecipient {
  recipientCode: string; // e.g. "RCP_xxxxxx"
  type: string;          // "nuban"
  name: string;
  accountNumber: string;
  bankCode: string;
  bankName?: string;
  currency: string;
  createdAt?: string;
}

export interface PaystackTransferInitiation {
  transferCode: string;  // e.g. "TRF_xxxxxx"
  reference: string;
  status: 'pending' | 'success' | 'failed' | 'reversed';
  amount: number;        // kobo
  currency: string;
}

// ─── Stub helpers ────────────────────────────────────────────────────────────

const STUB_BANKS: PaystackBank[] = [
  { name: 'Access Bank', code: '044', country: 'Nigeria', currency: 'NGN', slug: 'access-bank', active: true },
  { name: 'GTBank', code: '058', country: 'Nigeria', currency: 'NGN', slug: 'gtbank', active: true },
  { name: 'First Bank of Nigeria', code: '011', country: 'Nigeria', currency: 'NGN', slug: 'first-bank', active: true },
  { name: 'UBA', code: '033', country: 'Nigeria', currency: 'NGN', slug: 'uba', active: true },
  { name: 'Zenith Bank', code: '057', country: 'Nigeria', currency: 'NGN', slug: 'zenith-bank', active: true },
  { name: 'Kuda Bank', code: '50211', country: 'Nigeria', currency: 'NGN', slug: 'kuda', active: true },
  { name: 'Opay', code: '999992', country: 'Nigeria', currency: 'NGN', slug: 'opay', active: true },
  { name: 'PalmPay', code: '999991', country: 'Nigeria', currency: 'NGN', slug: 'palmpay', active: true },
  { name: 'Wema Bank', code: '035', country: 'Nigeria', currency: 'NGN', slug: 'wema-bank', active: true },
  { name: 'Fidelity Bank', code: '070', country: 'Nigeria', currency: 'NGN', slug: 'fidelity-bank', active: true },
];

/**
 * Fail loud in production when a required key is missing.
 *
 * In dev/test, missing Paystack creds silently fall back to deterministic
 * stubs so the full NGN-withdrawal flow works offline. In production that
 * behaviour would silently ship fake bank lists, fake account resolutions,
 * and "successful" transfers that never actually move money — exactly the
 * kind of bug that looks fine in QA and is catastrophic in prod.
 */
function refuseStubInProduction(what: string): void {
  const env = process.env['NODE_ENV'];
  const allowDevStubs = process.env['FRENZPAY_ALLOW_DEV_STUBS'] === '1';
  if (env === 'production' && !allowDevStubs) {
    throw new Error(
      `[paystack] Missing PAYSTACK_SECRET_KEY in production — refusing to ${what}. ` +
      `Set PAYSTACK_SECRET_KEY in /home/frenzpay/shared/.env.production, or ` +
      `export FRENZPAY_ALLOW_DEV_STUBS=1 to explicitly opt in to stubs (not recommended).`,
    );
  }
}

function stubAccountName(accountNumber: string): string {
  // Deterministic so the same account always resolves to the same name
  const h = createHmac('sha256', 'stub').update(accountNumber).digest('hex');
  const firstNames = ['JANE', 'JOHN', 'ADE', 'BOLA', 'CHIDI', 'FATIMA', 'GRACE', 'IFEOMA'];
  const lastNames = ['DOE', 'SMITH', 'OKAFOR', 'ADEBAYO', 'NWOSU', 'HASSAN', 'WILLIAMS', 'OKOYE'];
  const idx1 = parseInt(h.slice(0, 2), 16) % firstNames.length;
  const idx2 = parseInt(h.slice(2, 4), 16) % lastNames.length;
  return `${firstNames[idx1]} ${lastNames[idx2]}`;
}

// ─── Internal fetch helper ───────────────────────────────────────────────────

async function paystackFetch<T>(path: string, init: RequestInit, secretKey: string, base: string): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const body = await res.text();
  let parsed: { status?: boolean; message?: string; data?: unknown } = {};
  try { parsed = JSON.parse(body); } catch { /* non-JSON error */ }

  if (!res.ok || parsed.status === false) {
    throw new Error(`Paystack ${init.method ?? 'GET'} ${path} failed: ${res.status} — ${parsed.message ?? body.slice(0, 200)}`);
  }

  return (parsed.data ?? parsed) as T;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** List active Nigerian banks (and fintech wallets). */
export async function listNigerianBanks(): Promise<PaystackBank[]> {
  const secretKey = process.env['PAYSTACK_SECRET_KEY'];
  const base = process.env['PAYSTACK_API_BASE'] ?? DEFAULT_BASE;

  if (!secretKey) {
    refuseStubInProduction('return a stub bank list');
    console.warn('[paystack] Missing PAYSTACK_SECRET_KEY — returning stub bank list');
    return STUB_BANKS;
  }

  const data = await paystackFetch<PaystackBank[]>(
    '/bank?country=nigeria&use_cursor=false&perPage=100',
    { method: 'GET' },
    secretKey,
    base,
  );
  return data.filter((b) => b.active);
}

/**
 * Resolve a Nigerian account number against a bank to get the account holder's name.
 * Used for confirmation before initiating a payout.
 */
export async function resolveNigerianAccount(
  accountNumber: string,
  bankCode: string,
): Promise<PaystackAccountResolution> {
  const secretKey = process.env['PAYSTACK_SECRET_KEY'];
  const base = process.env['PAYSTACK_API_BASE'] ?? DEFAULT_BASE;

  if (!/^\d{10}$/.test(accountNumber)) {
    throw new Error('Invalid account number. Must be exactly 10 digits.');
  }

  if (!secretKey) {
    refuseStubInProduction('return a stub account resolution');
    console.warn('[paystack] Missing PAYSTACK_SECRET_KEY — returning stub account resolution');
    return { accountNumber, accountName: stubAccountName(accountNumber), bankCode };
  }

  const data = await paystackFetch<{ account_number: string; account_name: string; bank_id?: number }>(
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    { method: 'GET' },
    secretKey,
    base,
  );

  return {
    accountNumber: data.account_number,
    accountName: data.account_name,
    bankCode,
  };
}

/**
 * Create a Paystack transfer recipient — required before initiating a payout.
 * This is cached per-beneficiary.
 */
export async function createPaystackRecipient(
  name: string,
  bankCode: string,
  accountNumber: string,
): Promise<PaystackTransferRecipient> {
  const secretKey = process.env['PAYSTACK_SECRET_KEY'];
  const base = process.env['PAYSTACK_API_BASE'] ?? DEFAULT_BASE;

  if (!secretKey) {
    refuseStubInProduction('return a stub recipient');
    console.warn('[paystack] Missing PAYSTACK_SECRET_KEY — returning stub recipient');
    return {
      recipientCode: `RCP_stub_${createHmac('sha256', 'stub').update(accountNumber).digest('hex').slice(0, 12)}`,
      type: 'nuban',
      name,
      accountNumber,
      bankCode,
      currency: 'NGN',
    };
  }

  const data = await paystackFetch<{
    recipient_code: string;
    type: string;
    name: string;
    details: { account_number: string; bank_code: string; bank_name?: string };
    currency: string;
    createdAt?: string;
  }>(
    '/transferrecipient',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'nuban',
        name,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: 'NGN',
      }),
    },
    secretKey,
    base,
  );

  return {
    recipientCode: data.recipient_code,
    type: data.type,
    name: data.name,
    accountNumber: data.details.account_number,
    bankCode: data.details.bank_code,
    bankName: data.details.bank_name,
    currency: data.currency,
    createdAt: data.createdAt,
  };
}

/**
 * Initiate a transfer (payout) to a recipient.
 * Returns a pending transfer — the final status arrives via webhook.
 */
export async function initiatePaystackTransfer(params: {
  recipientCode: string;
  amountKobo: bigint;
  reference: string;
  reason?: string;
}): Promise<PaystackTransferInitiation> {
  const secretKey = process.env['PAYSTACK_SECRET_KEY'];
  const base = process.env['PAYSTACK_API_BASE'] ?? DEFAULT_BASE;

  if (params.amountKobo <= 0n) {
    throw new Error('Transfer amount must be positive');
  }

  if (!secretKey) {
    refuseStubInProduction('return a stub transfer (no real money would move)');
    console.warn('[paystack] Missing PAYSTACK_SECRET_KEY — returning stub transfer');
    return {
      transferCode: `TRF_stub_${params.reference.slice(0, 12)}`,
      reference: params.reference,
      status: 'pending',
      amount: Number(params.amountKobo),
      currency: 'NGN',
    };
  }

  const data = await paystackFetch<{
    transfer_code: string;
    reference: string;
    status: string;
    amount: number;
    currency: string;
  }>(
    '/transfer',
    {
      method: 'POST',
      body: JSON.stringify({
        source: 'balance',
        amount: Number(params.amountKobo), // Paystack accepts amount as number (kobo)
        recipient: params.recipientCode,
        reference: params.reference,
        reason: params.reason ?? 'FrenzPay withdrawal',
      }),
    },
    secretKey,
    base,
  );

  return {
    transferCode: data.transfer_code,
    reference: data.reference,
    status: data.status as PaystackTransferInitiation['status'],
    amount: data.amount,
    currency: data.currency,
  };
}

/**
 * Verify a Paystack webhook signature.
 * Paystack signs the raw JSON body with HMAC-SHA512(secret_key).
 *
 * @param rawBody   Raw request body string
 * @param signature Value from the `x-paystack-signature` header
 */
export function verifyPaystackWebhookSignature(rawBody: string, signature: string): boolean {
  // Paystack signs webhooks with your secret key (NOT the webhook secret).
  const signingKey = process.env['PAYSTACK_SECRET_KEY'];

  if (!signingKey) {
    console.warn('[paystack] PAYSTACK_SECRET_KEY missing — allowing webhook in dev mode');
    return process.env['NODE_ENV'] !== 'production';
  }
  if (!signature) return false;

  const computed = createHmac('sha512', signingKey).update(rawBody, 'utf8').digest('hex');
  try {
    return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}
