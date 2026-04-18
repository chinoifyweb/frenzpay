/**
 * GET /api/banks/ng
 * Returns a list of Nigerian banks from Paystack (cached 24h in Redis).
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { listNigerianBanks } from '@frenzpay/providers/paystack';
import { redis } from '@/lib/redis';

const CACHE_KEY = 'banks:ng';
const CACHE_TTL = 24 * 60 * 60; // 24 hours

export async function GET() {
  await requireSession();

  // Try cache first
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      return NextResponse.json(JSON.parse(cached));
    }
  } catch {
    // Redis is optional for this endpoint — fall through to live fetch
  }

  const banks = await listNigerianBanks();
  const response = {
    banks: banks.map((b) => ({
      name: b.name,
      code: b.code,
      slug: b.slug ?? null,
    })),
    count: banks.length,
  };

  try {
    await redis.set(CACHE_KEY, JSON.stringify(response), 'EX', CACHE_TTL);
  } catch { /* ignore cache write failure */ }

  return NextResponse.json(response);
}
