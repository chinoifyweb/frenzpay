/**
 * GET /api/health
 * Liveness + readiness endpoint.
 * Unauthenticated. Returns 200 with status details, or 503 if any dependency
 * is unreachable. Used by load balancers, uptime monitors, and CI smoke tests.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@frenzpay/db';
import { redis } from '@/lib/redis';
import { captureError } from '@/lib/observability';

export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};
  const start = Date.now();

  // DB check — simple ping
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.db = { ok: false, error: err instanceof Error ? err.message : String(err) };
    await captureError(err, { check: 'db' });
  }

  // Redis check
  const redisStart = Date.now();
  try {
    await redis.ping();
    checks.redis = { ok: true, latencyMs: Date.now() - redisStart };
  } catch (err) {
    checks.redis = { ok: false, error: err instanceof Error ? err.message : String(err) };
    await captureError(err, { check: 'redis' });
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  const status = allOk ? 'healthy' : 'degraded';

  return NextResponse.json(
    {
      status,
      version: process.env['APP_VERSION'] ?? 'dev',
      checks,
      totalLatencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 },
  );
}
