/**
 * Singleton ioredis client for the web app.
 *
 * Used for:
 * - Session storage (keys: session:{sid}, user_sessions:{userId})
 * - Rate limiting  (keys: rl:{action}:ip:{ip}, rl:{action}:user:{userId})
 * - OTP challenge tokens (keys: mfa_challenge:{token})
 * - Idempotency locks
 *
 * In development: connects to localhost:6379 (no password)
 * In production:  REDIS_URL env var (redis://:password@host:port)
 */

import { Redis } from 'ioredis';

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

function createRedisClient(): Redis {
  const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    // Reconnect strategy: exponential backoff up to 30s
    retryStrategy: (times: number) => Math.min(times * 200, 30_000),
  });

  client.on('error', (err: Error) => {
    // Use process.stderr to avoid PII redaction hooks on logger
    process.stderr.write(`[redis] error: ${err.message}\n`);
  });

  client.on('connect', () => {
    process.stderr.write('[redis] connected\n');
  });

  return client;
}

// Singleton — reuse across hot reloads in development
export const redis: Redis =
  globalThis.__redis ?? (globalThis.__redis = createRedisClient());
