/**
 * TOTP (Time-based One-Time Password) utilities.
 *
 * RFC 6238 / RFC 4226 compliant via the `otpauth` library.
 * - 6 digits, 30-second period, SHA-1 (compatible with all authenticator apps)
 * - Validates with window ±1 (accepts codes from adjacent 30-second windows to
 *   handle clock skew)
 * - Backup codes: 8 × 8-char alphanumeric, hashed with SHA-256 for storage
 */

import * as OTPAuth from 'otpauth';
import { createHash, randomBytes } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TotpSetup {
  /** Base32-encoded secret — store encrypted in DB */
  secret: string;
  /** otpauth:// URI — pass to QR code generator */
  uri: string;
}

// ─── TOTP ─────────────────────────────────────────────────────────────────────

/**
 * Generate a new TOTP secret for enrollment.
 * @param accountName Usually the user's email or FrenzTag
 */
export function generateTotpSecret(
  accountName: string,
  issuer = 'FrenzPay',
): TotpSetup {
  const secret = new OTPAuth.Secret({ size: 20 }); // 160-bit key
  const totp = new OTPAuth.TOTP({
    issuer,
    label: encodeURIComponent(accountName),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  return {
    secret: secret.base32,
    uri: totp.toString(),
  };
}

/**
 * Verify a TOTP token against a stored base32 secret.
 * Returns true if valid within ±1 window (handles 30s clock drift).
 */
export function verifyTotp(secretBase32: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;

  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secretBase32),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });

  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

// ─── Backup codes ─────────────────────────────────────────────────────────────

/** Generate 8 backup codes, each 8 chars alphanumeric. Returns [plaintext, hashes]. */
export function generateBackupCodes(): { codes: string[]; hashes: string[] } {
  const CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // no ambiguous chars (0/O, 1/I/l)
  const codes = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () =>
      CHARS[randomBytes(1)[0]! % CHARS.length],
    ).join(''),
  );

  const hashes = codes.map((code) =>
    createHash('sha256').update(code).digest('hex'),
  );

  return { codes, hashes };
}

/**
 * Verify a submitted backup code against stored hashes.
 * Returns the index of the matched hash (for marking as used), or -1.
 */
export function verifyBackupCode(submitted: string, hashes: string[]): number {
  const submittedHash = createHash('sha256')
    .update(submitted.toLowerCase().replace(/\s+/g, ''))
    .digest('hex');

  return hashes.findIndex((h) => h === submittedHash);
}
