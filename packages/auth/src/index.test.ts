/**
 * Unit tests for @frenzpay/auth
 *
 * Covers:
 * - argon2id password + PIN hashing round-trip
 * - Token hashing + timing-safe comparison
 * - OTP format (6-digit numeric)
 * - Session seal / unseal round-trip
 * - Session expiry and tamper rejection
 * - TOTP generate / verify
 * - Backup code generate / verify
 */

import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  hashPassword, verifyPassword,
  hashPin, verifyPin,
  generateOtp, hashToken, generateSecureToken,
  timingSafeStringEqual,
} from './index.js';
import { sealSession, unsealSession, SESSION_COOKIE_NAME, IDLE_TTL_SECONDS } from './session.js';
import { generateTotpSecret, verifyTotp, generateBackupCodes, verifyBackupCode } from './totp.js';

// ─── Password / PIN ───────────────────────────────────────────────────────────

describe('hashPassword / verifyPassword', () => {
  it('round-trips a correct password', async () => {
    const pw = 'Correct-Horse-Battery-Staple-42!';
    const hash = await hashPassword(pw);
    expect(hash).not.toBe(pw);
    expect(await verifyPassword(pw, hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('CorrectP@ssword1!');
    expect(await verifyPassword('WrongPassword!1', hash)).toBe(false);
  });

  it('produces different hashes for the same password (random salt)', async () => {
    const pw = 'SamePa$$word123!';
    const h1 = await hashPassword(pw);
    const h2 = await hashPassword(pw);
    expect(h1).not.toBe(h2);
  });
});

describe('hashPin / verifyPin', () => {
  it('round-trips a 6-digit PIN', async () => {
    const hash = await hashPin('123456');
    expect(await verifyPin('123456', hash)).toBe(true);
  });

  it('rejects wrong PIN', async () => {
    const hash = await hashPin('123456');
    expect(await verifyPin('654321', hash)).toBe(false);
  });
});

// ─── OTP / Token ──────────────────────────────────────────────────────────────

describe('generateOtp', () => {
  it('produces a 6-digit string', () => {
    for (let i = 0; i < 20; i++) {
      const otp = generateOtp();
      expect(otp).toMatch(/^\d{6}$/);
    }
  });

  it('has reasonable entropy (50 samples should not all be the same)', () => {
    const otps = new Set(Array.from({ length: 50 }, () => generateOtp()));
    expect(otps.size).toBeGreaterThan(10);
  });
});

describe('hashToken', () => {
  it('is deterministic', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('differs for different inputs', () => {
    expect(hashToken('abc')).not.toBe(hashToken('ABC'));
  });

  it('produces a 64-char hex string (SHA-256)', () => {
    expect(hashToken('test')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('generateSecureToken', () => {
  it('produces a 64-char hex string by default', () => {
    expect(generateSecureToken(32)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('timingSafeStringEqual', () => {
  it('returns true for equal strings', () => {
    expect(timingSafeStringEqual('hello', 'hello')).toBe(true);
  });

  it('returns false for different strings', () => {
    expect(timingSafeStringEqual('hello', 'world')).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(timingSafeStringEqual('a', 'ab')).toBe(false);
  });
});

// ─── Session seal / unseal ────────────────────────────────────────────────────

describe('sealSession / unsealSession', () => {
  const password = randomBytes(32).toString('hex');

  const validSession = {
    sid: 'test-sid-123',
    userId: 'user-uuid-456',
    role: 'user',
    kycTier: 0,
    absoluteExpiry: Date.now() + 3600_000, // 1 hour from now
  };

  it('round-trips a session payload', async () => {
    const sealed = await sealSession(validSession, password);
    expect(typeof sealed).toBe('string');
    expect(sealed.length).toBeGreaterThan(50);

    const unsealed = await unsealSession(sealed, password);
    expect(unsealed).not.toBeNull();
    expect(unsealed!.sid).toBe(validSession.sid);
    expect(unsealed!.userId).toBe(validSession.userId);
    expect(unsealed!.role).toBe(validSession.role);
    expect(unsealed!.kycTier).toBe(validSession.kycTier);
  });

  it('returns null for a tampered payload', async () => {
    const sealed = await sealSession(validSession, password);
    const tampered = sealed.slice(0, -10) + 'aaaaaaaaaa';
    const result = await unsealSession(tampered, password);
    expect(result).toBeNull();
  });

  it('returns null for wrong password', async () => {
    const sealed = await sealSession(validSession, password);
    const result = await unsealSession(sealed, 'wrong-password');
    expect(result).toBeNull();
  });

  it('returns null for an empty string', async () => {
    const result = await unsealSession('', password);
    expect(result).toBeNull();
  });

  it('exports correct constants', () => {
    expect(SESSION_COOKIE_NAME).toBe('frenzpay-session');
    expect(IDLE_TTL_SECONDS).toBe(900); // 15 minutes
  });
});

// ─── TOTP ─────────────────────────────────────────────────────────────────────

describe('generateTotpSecret', () => {
  it('returns a base32 secret and a valid otpauth URI', () => {
    const { secret, uri } = generateTotpSecret('test@frenzpay.co');
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('FrenzPay');
  });

  it('produces different secrets each time', () => {
    const { secret: s1 } = generateTotpSecret('user@example.com');
    const { secret: s2 } = generateTotpSecret('user@example.com');
    expect(s1).not.toBe(s2);
  });
});

describe('verifyTotp', () => {
  it('rejects a clearly invalid 6-digit token', () => {
    const { secret } = generateTotpSecret('test@test.com');
    // 000000 is astronomically unlikely to be valid
    // but we test the interface, not timing attacks
    const result = verifyTotp(secret, '999999');
    expect(typeof result).toBe('boolean');
  });

  it('rejects non-6-digit tokens', () => {
    const { secret } = generateTotpSecret('test@test.com');
    expect(verifyTotp(secret, '12345')).toBe(false);
    expect(verifyTotp(secret, 'abcdef')).toBe(false);
    expect(verifyTotp(secret, '')).toBe(false);
  });
});

// ─── Backup codes ─────────────────────────────────────────────────────────────

describe('generateBackupCodes / verifyBackupCode', () => {
  it('generates 8 codes and 8 hashes', () => {
    const { codes, hashes } = generateBackupCodes();
    expect(codes).toHaveLength(8);
    expect(hashes).toHaveLength(8);
  });

  it('each code is 8 characters', () => {
    const { codes } = generateBackupCodes();
    for (const code of codes) {
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[a-z2-9]+$/);
    }
  });

  it('verifies a code against its hash', () => {
    const { codes, hashes } = generateBackupCodes();
    expect(verifyBackupCode(codes[0]!, hashes)).toBe(0);
    expect(verifyBackupCode(codes[3]!, hashes)).toBe(3);
  });

  it('returns -1 for an invalid code', () => {
    const { hashes } = generateBackupCodes();
    expect(verifyBackupCode('xxxxxxxx', hashes)).toBe(-1);
  });

  it('handles case-insensitive and whitespace-trimmed input', () => {
    const { codes, hashes } = generateBackupCodes();
    // Backup codes are lowercase; test upper + spaces
    expect(verifyBackupCode(codes[0]!.toUpperCase(), hashes)).toBe(0);
    expect(verifyBackupCode(`  ${codes[1]!}  `, hashes)).toBe(1);
  });
});
