/**
 * Dojah KYC provider client
 * https://docs.dojah.io/
 *
 * Used for:
 * - BVN lookup + name matching (T1)
 * - NIN lookup (T1 alternative)
 * - Selfie liveness check (T2)
 *
 * All calls are server-side only. API keys are never exposed to the client.
 * If DOJAH_APP_ID / DOJAH_PRIVATE_KEY are absent → stub mode (dev only).
 */

const DOJAH_BASE = 'https://api.dojah.io';

export interface DojahBvnResult {
  verified: boolean;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  phone?: string;
  dateOfBirth?: string;
  raw?: unknown;
}

export interface DojahNinResult {
  verified: boolean;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  raw?: unknown;
}

export interface DojahLivenessResult {
  verified: boolean;
  confidence?: number;
  raw?: unknown;
}

async function dojahFetch<T>(
  path: string,
  body: Record<string, unknown>,
  appId: string,
  privateKey: string,
): Promise<T> {
  const res = await fetch(`${DOJAH_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      AppId: appId,
      Authorization: privateKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Dojah ${path} failed: HTTP ${res.status} — ${text}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Verify a BVN against Dojah.
 *
 * @param bvn  11-digit BVN (plain text — never logged or stored)
 * @param userId  Internal user ID for idempotency tracking
 */
export async function verifyBvn(bvn: string, userId: string): Promise<DojahBvnResult> {
  const appId = process.env['DOJAH_APP_ID'];
  const privateKey = process.env['DOJAH_PRIVATE_KEY'];

  if (!appId || !privateKey) {
    // Dev/test stub — never used in production
    console.warn('[dojah] Missing credentials — returning stub BVN result (DEV ONLY)');
    return { verified: true, firstName: 'STUB', lastName: 'USER', raw: { stub: true } };
  }

  const data = await dojahFetch<{
    entity?: {
      first_name?: string;
      last_name?: string;
      middle_name?: string;
      mobile?: string;
      date_of_birth?: string;
    };
    error?: string;
  }>(
    '/v1/kyc/bvn',
    { bvn, consent: true },
    appId,
    privateKey,
  );

  if (data.error || !data.entity) {
    return { verified: false, raw: data };
  }

  return {
    verified: true,
    firstName: data.entity.first_name,
    lastName: data.entity.last_name,
    middleName: data.entity.middle_name,
    phone: data.entity.mobile,
    dateOfBirth: data.entity.date_of_birth,
    raw: data,
  };
}

/**
 * Verify a NIN via Dojah.
 */
export async function verifyNin(nin: string, _userId: string): Promise<DojahNinResult> {
  const appId = process.env['DOJAH_APP_ID'];
  const privateKey = process.env['DOJAH_PRIVATE_KEY'];

  if (!appId || !privateKey) {
    console.warn('[dojah] Missing credentials — returning stub NIN result (DEV ONLY)');
    return { verified: true, firstName: 'STUB', lastName: 'USER', raw: { stub: true } };
  }

  const data = await dojahFetch<{
    entity?: {
      first_name?: string;
      last_name?: string;
      birthdate?: string;
    };
    error?: string;
  }>(
    '/v1/kyc/nin',
    { nin, consent: true },
    appId,
    privateKey,
  );

  if (data.error || !data.entity) {
    return { verified: false, raw: data };
  }

  return {
    verified: true,
    firstName: data.entity.first_name,
    lastName: data.entity.last_name,
    dateOfBirth: data.entity.birthdate,
    raw: data,
  };
}

/**
 * Liveness check via Dojah Selfie Verification.
 *
 * @param selfieBase64  Base64-encoded JPEG/PNG image
 */
export async function verifyLiveness(selfieBase64: string, _userId: string): Promise<DojahLivenessResult> {
  const appId = process.env['DOJAH_APP_ID'];
  const privateKey = process.env['DOJAH_PRIVATE_KEY'];

  if (!appId || !privateKey) {
    console.warn('[dojah] Missing credentials — returning stub liveness result (DEV ONLY)');
    return { verified: true, confidence: 0.99, raw: { stub: true } };
  }

  const data = await dojahFetch<{
    entity?: { confidence_value?: number };
    error?: string;
  }>(
    '/v1/kyc/selfie',
    { image: selfieBase64 },
    appId,
    privateKey,
  );

  if (data.error || !data.entity) {
    return { verified: false, raw: data };
  }

  const confidence = data.entity.confidence_value ?? 0;
  return {
    verified: confidence >= 0.7,
    confidence,
    raw: data,
  };
}
