/**
 * GET /api/banks
 *
 * Returns the list of Nigerian banks with their NIP codes. Authenticated
 * users only (any role) — customers use this to pick a bank when creating a
 * NGN beneficiary; admins use it for the withdrawal review UI.
 *
 * We memoise the upstream GET /bank response for 1 hour to avoid hammering
 * Graph every page-load. Cache lives in Redis with key "graph:banks:v1".
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { redis } from '@/lib/redis';
import { listGraphBanks, type GraphBankListItem } from '@frenzpay/providers/graph';
import { logger } from '@frenzpay/logger';

const CACHE_KEY = 'graph:banks:v1';
const CACHE_TTL_SECONDS = 60 * 60; // 1h

async function getBanks(): Promise<GraphBankListItem[]> {
  // Cache read
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as GraphBankListItem[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      '[banks] Redis cache read failed; falling through',
    );
  }

  // Live fetch
  const banks = await listGraphBanks();
  // Cache write (best-effort)
  try {
    await redis.set(CACHE_KEY, JSON.stringify(banks), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      '[banks] Redis cache write failed',
    );
  }
  return banks;
}

export async function GET(_req: NextRequest) {
  await requireSession();
  try {
    const banks = await getBanks();
    // Sort alphabetically for UI convenience; most popular first if we had
    // that data. For now, plain alpha ordering.
    const sorted = [...banks].sort((a, b) => (a.bank_name ?? '').localeCompare(b.bank_name ?? ''));
    return NextResponse.json({ banks: sorted, count: sorted.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, '[banks] Failed to load from Graph');
    return NextResponse.json(
      { error: 'Could not load bank list', detail: msg },
      { status: 502 },
    );
  }
}
