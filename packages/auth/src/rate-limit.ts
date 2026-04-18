/**
 * Redis sliding-window rate limiter.
 *
 * Uses a sorted set: members = `{timestamp}:{nonce}`, score = timestamp (ms).
 * On each request:
 *   1. Remove members with score < (now - window)
 *   2. Count remaining members
 *   3. If count < limit → add member, refresh TTL → allowed
 *   4. Else → return oldest timestamp to derive resetAt → denied
 *
 * All steps run atomically in a single Lua script (no TOCTOU race).
 */

import type { Redis } from 'ioredis';
import { randomBytes } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterMs: number;
}

// ─── Core sliding-window check ────────────────────────────────────────────────

const SLIDING_WINDOW_LUA = `
local key          = KEYS[1]
local now          = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local limit        = tonumber(ARGV[3])
local window_ms    = tonumber(ARGV[4])
local member       = ARGV[5]

-- Evict expired members
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

local count = redis.call('ZCARD', key)

if count < limit then
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window_ms)
  return {1, limit - count - 1, now + window_ms}
else
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldest_ts = tonumber(oldest[2])
  return {0, 0, oldest_ts + window_ms}
end
`;

export async function checkRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const nonce = randomBytes(6).toString('hex');
  const member = `${now}:${nonce}`;

  const result = await redis.eval(
    SLIDING_WINDOW_LUA,
    1,
    key,
    String(now),
    String(windowStart),
    String(limit),
    String(windowMs),
    member,
  ) as [number, number, number];

  const [allowedFlag, remaining, resetTs] = result;
  const resetAt = new Date(resetTs);

  return {
    allowed: allowedFlag === 1,
    remaining,
    resetAt,
    retryAfterMs: allowedFlag === 1 ? 0 : Math.max(0, resetTs - now),
  };
}

// ─── Auth-specific rate limit presets ─────────────────────────────────────────

type AuthAction =
  | 'login'
  | 'signup'
  | 'otp_send'
  | 'otp_verify'
  | 'password_reset'
  | 'mfa_verify';

const AUTH_RATE_CONFIGS: Record<
  AuthAction,
  { ipLimit: number; ipWindowMs: number; userLimit: number; userWindowMs: number }
> = {
  login:          { ipLimit: 20,  ipWindowMs: 15 * 60_000, userLimit: 10, userWindowMs: 15 * 60_000 },
  signup:         { ipLimit: 5,   ipWindowMs: 60 * 60_000, userLimit: 0,  userWindowMs: 0 },
  otp_send:       { ipLimit: 10,  ipWindowMs: 10 * 60_000, userLimit: 3,  userWindowMs: 10 * 60_000 },
  otp_verify:     { ipLimit: 20,  ipWindowMs: 10 * 60_000, userLimit: 5,  userWindowMs: 10 * 60_000 },
  password_reset: { ipLimit: 5,   ipWindowMs: 60 * 60_000, userLimit: 3,  userWindowMs: 60 * 60_000 },
  mfa_verify:     { ipLimit: 20,  ipWindowMs: 10 * 60_000, userLimit: 5,  userWindowMs: 10 * 60_000 },
};

/**
 * Check both IP-level and (optionally) user-level rate limits for an auth action.
 * Returns the first denied result, or the user-level result if both pass.
 */
export async function checkAuthRateLimit(
  redis: Redis,
  opts: {
    ip: string;
    userId?: string;
    action: AuthAction;
  },
): Promise<RateLimitResult> {
  const config = AUTH_RATE_CONFIGS[opts.action];

  const ipKey = `rl:${opts.action}:ip:${opts.ip}`;
  const ipResult = await checkRateLimit(redis, ipKey, config.ipLimit, config.ipWindowMs);
  if (!ipResult.allowed) return ipResult;

  if (opts.userId && config.userLimit > 0) {
    const userKey = `rl:${opts.action}:user:${opts.userId}`;
    const userResult = await checkRateLimit(redis, userKey, config.userLimit, config.userWindowMs);
    if (!userResult.allowed) return userResult;
    return userResult;
  }

  return ipResult;
}

// ─── Response helper ──────────────────────────────────────────────────────────

/** Standard 429 response headers from a RateLimitResult */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.floor(result.resetAt.getTime() / 1000)),
    ...(result.retryAfterMs > 0
      ? { 'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)) }
      : {}),
  };
}
