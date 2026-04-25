/**
 * Server-side session management for the web app.
 *
 * This layer wraps the pure @frenzpay/auth/session helpers with Redis I/O.
 * Call `getSession()` from any Server Component, Server Action, or API Route
 * that needs the current user. Call `requireSession()` to throw a redirect if
 * unauthenticated.
 *
 * Middleware (Edge runtime) uses the sealed cookie directly for routing — it
 * does NOT call these functions. All data-touching code MUST call getSession().
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import {
  SESSION_COOKIE_NAME,
  IDLE_TTL_SECONDS,
  ABSOLUTE_TTL_SECONDS,
  sealSession,
  unsealSession,
  sessionCookieOptions,
  sessionRedisKey,
  userSessionsRedisKey,
  type CookieSession,
  type StoredSession,
} from '@frenzpay/auth/session';
import { redis } from './redis';

// Lazy env read so `next build` can collect page data without this set.
// Throws on first actual use if still missing at request time.
function getSessionSecret(): string {
  const v = process.env.SESSION_SECRET;
  if (!v) throw new Error('SESSION_SECRET env var is required at runtime');
  return v;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export interface CreateSessionInput {
  userId: string;
  email: string;
  role: string;
  kycTier: number;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  mfaVerified?: boolean;
}

/**
 * Create a new session: write to Redis, return sealed cookie value.
 * The caller is responsible for setting the cookie on the response.
 */
export async function createSession(input: CreateSessionInput): Promise<string> {
  const sid = randomUUID();
  const now = Date.now();

  const stored: StoredSession = {
    sid,
    userId: input.userId,
    email: input.email,
    role: input.role,
    kycTier: input.kycTier,
    deviceId: input.deviceId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    mfaVerified: input.mfaVerified ?? false,
    createdAt: now,
    lastActiveAt: now,
    absoluteExpiry: now + ABSOLUTE_TTL_SECONDS * 1000,
  };

  const pipeline = redis.pipeline();
  pipeline.set(sessionRedisKey(sid), JSON.stringify(stored), 'EX', IDLE_TTL_SECONDS);
  pipeline.sadd(userSessionsRedisKey(input.userId), sid);
  pipeline.expire(userSessionsRedisKey(input.userId), ABSOLUTE_TTL_SECONDS);
  await pipeline.exec();

  const cookie: CookieSession = {
    sid,
    userId: input.userId,
    role: input.role,
    kycTier: input.kycTier,
    absoluteExpiry: stored.absoluteExpiry,
  };

  return sealSession(cookie, getSessionSecret());
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Get the current session from the request cookie + Redis.
 * Refreshes the idle TTL on every call.
 * Returns null if no valid session exists.
 */
export async function getSession(): Promise<{ sid: string; session: StoredSession } | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;

  const cookie = await unsealSession(raw, getSessionSecret());
  if (!cookie) return null;

  // Quick expiry check without Redis hit
  if (Date.now() > cookie.absoluteExpiry) return null;

  const stored = await redis.get(sessionRedisKey(cookie.sid));
  if (!stored) return null;

  const session: StoredSession = JSON.parse(stored);

  // Double-check absolute expiry from stored record
  if (Date.now() > session.absoluteExpiry) {
    await deleteSession(session.sid, session.userId);
    return null;
  }

  // Refresh idle TTL
  void redis.expire(sessionRedisKey(cookie.sid), IDLE_TTL_SECONDS);

  return { sid: cookie.sid, session };
}

/**
 * Like getSession() but redirects to /login if unauthenticated.
 */
export async function requireSession(): Promise<{ sid: string; session: StoredSession }> {
  const result = await getSession();
  if (!result) redirect('/login');
  return result;
}

/**
 * Like requireSession() but additionally checks role.
 */
export async function requireRole(
  role: string,
): Promise<{ sid: string; session: StoredSession }> {
  const result = await requireSession();
  if (result.session.role !== role) redirect('/dashboard');
  return result;
}


// ─── Delete / Revoke ──────────────────────────────────────────────────────────

export async function deleteSession(sid: string, userId: string): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.del(sessionRedisKey(sid));
  pipeline.srem(userSessionsRedisKey(userId), sid);
  await pipeline.exec();
}

/** Panic freeze: deletes ALL sessions for a user. */
export async function deleteAllUserSessions(userId: string): Promise<void> {
  const sids = await redis.smembers(userSessionsRedisKey(userId));
  if (!sids.length) return;

  const pipeline = redis.pipeline();
  for (const sid of sids) pipeline.del(sessionRedisKey(sid));
  pipeline.del(userSessionsRedisKey(userId));
  await pipeline.exec();
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listUserSessions(userId: string): Promise<StoredSession[]> {
  const sids = await redis.smembers(userSessionsRedisKey(userId));
  if (!sids.length) return [];

  const staleIds: string[] = [];
  const sessions: StoredSession[] = [];

  for (const sid of sids) {
    const raw = await redis.get(sessionRedisKey(sid));
    if (raw) {
      sessions.push(JSON.parse(raw) as StoredSession);
    } else {
      staleIds.push(sid);
    }
  }

  if (staleIds.length > 0) {
    const pipeline = redis.pipeline();
    for (const sid of staleIds) pipeline.srem(userSessionsRedisKey(userId), sid);
    await pipeline.exec();
  }

  return sessions;
}

// ─── Cookie builder ───────────────────────────────────────────────────────────

export { sessionCookieOptions };
