// Re-export sub-modules for convenience
export * from './session';
export * from './rate-limit';
export * from './totp';

import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// ─── Password hashing (Argon2id via @node-rs/argon2 — prebuilt binary) ────────

export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

// ─── PIN hashing ──────────────────────────────────────────────────────────────

export async function hashPin(pin: string): Promise<string> {
  return hash(pin);
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  try {
    return await verify(stored, pin);
  } catch {
    return false;
  }
}

// ─── OTP generation — 6-digit numeric string ─────────────────────────────────

export function generateOtp(): string {
  const bytes = randomBytes(4);
  const num = bytes.readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(6, '0');
}

// ─── Token hashing — SHA-256 hex ──────────────────────────────────────────────

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ─── Cryptographically random hex string ─────────────────────────────────────

export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

// ─── Constant-time string comparison ─────────────────────────────────────────

export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still run timingSafeEqual to prevent timing side-channels on length.
    timingSafeEqual(Buffer.alloc(bufA.length), Buffer.alloc(bufA.length));
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
