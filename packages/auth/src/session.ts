/**
 * Session primitives for FrenzPay.
 *
 * Architecture:
 *  - Cookie contains a sealed iron-session payload: { sid, userId, role, kycTier, absoluteExpiry }
 *  - Redis stores the full session record under `session:{sid}` with an idle TTL
 *  - This allows server-side revocation (panic freeze, device revoke) without invalidating the
 *    sealed cookie — the middleware trusts the cookie for routing, but API routes MUST call
 *    getSession() to validate against Redis before touching any data.
 *
 * Idle timeout  : 15 min (Redis EXPIRE refreshed on each authenticated API call)
 * Absolute limit: 12 hr  (stored in both cookie payload and Redis record)
 */

import { sealData, unsealData } from 'iron-session';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal data sealed into the HTTP cookie. Used in Edge middleware for routing. */
export interface CookieSession {
  sid: string;
  userId: string;
  role: string;         // 'user' | 'admin' | 'support'
  kycTier: number;      // 0-3
  absoluteExpiry: number; // unix ms
}

/** Full session record stored in Redis. */
export interface StoredSession {
  sid: string;
  userId: string;
  email: string;
  role: string;
  kycTier: number;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  mfaVerified: boolean;
  createdAt: number;      // unix ms
  lastActiveAt: number;   // unix ms
  absoluteExpiry: number; // unix ms
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const SESSION_COOKIE_NAME = 'frenzpay-session';
export const IDLE_TTL_SECONDS = 15 * 60;       // 15 minutes
export const ABSOLUTE_TTL_SECONDS = 12 * 3600; // 12 hours

// ─── Redis key helpers ────────────────────────────────────────────────────────

export function sessionRedisKey(sid: string): string {
  return `session:${sid}`;
}

export function userSessionsRedisKey(userId: string): string {
  return `user_sessions:${userId}`;
}

// ─── Cookie seal / unseal ─────────────────────────────────────────────────────

/**
 * Seal session data into an opaque cookie value.
 * ttl: 0 means the seal itself never expires — expiry is enforced by absoluteExpiry field and Redis.
 */
export async function sealSession(
  session: CookieSession,
  password: string,
): Promise<string> {
  return sealData(session, { password, ttl: 0 });
}

/**
 * Unseal a cookie value. Returns null on any tamper or parse error.
 */
export async function unsealSession(
  sealedCookie: string,
  password: string,
): Promise<CookieSession | null> {
  try {
    const data = await unsealData<CookieSession>(sealedCookie, { password, ttl: 0 });
    // Minimal shape validation
    if (!data?.sid || !data?.userId) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── Cookie options ───────────────────────────────────────────────────────────

export function sessionCookieOptions(value: string, maxAgeSeconds: number) {
  return {
    name: SESSION_COOKIE_NAME,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  } as const;
}
