// Force dynamic — these routes read cookies/headers and must never be statically rendered.
export const dynamic = 'force-dynamic';

/**
 * GET /api/fx/quote
 *
 * Fetch a live FX quote from Graph. Used by the customer wallet + admin
 * withdrawal review UI to display "1 USD = ₦X" plus our markup on top.
 *
 * Query:
 *   base  - ISO 4217, e.g. "USD"  (required)
 *   quote - ISO 4217, e.g. "NGN"  (required)
 *
 * Response:
 *   {
 *     base_currency, quote_currency,
 *     midRate,           // raw rate from Graph
 *     markupBps,         // FX markup applied on top (from /admin/settings)
 *     effectiveRate,     // midRate × (1 - markupBps/10_000) on sell side
 *     rate_id,           // pass this to /api/fx/conversion to lock
 *     expires_at,
 *     timestamp
 *   }
 *
 * The effective rate is a SELL rate from the user's perspective — i.e. how
 * many NGN they receive per 1 USD they're giving up. Markup reduces the rate
 * in our favour.
 *
 * Cached for 30 seconds in Redis to avoid hammering Graph on every page load.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { fetchGraphRate, isGraphConfigured } from '@frenzpay/providers/graph';
import { redis } from '@/lib/redis';
import { prisma } from '@frenzpay/db';
import { logger } from '@frenzpay/logger';

const ALLOWED = new Set(['USD', 'EUR', 'GBP', 'NGN', 'USDC']);
const CACHE_TTL_SECONDS = 30;

async function getMarkupBps(): Promise<number> {
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { key: 'fxMarkupBps' },
      select: { value: true },
    });
    if (row && typeof row.value === 'number') return row.value;
    if (row && typeof row.value === 'string') return Number(row.value) || 50;
  } catch { /* fall through */ }
  return 50; // default 0.5%
}

export async function GET(req: NextRequest) {
  await requireSession();

  if (!isGraphConfigured()) {
    return NextResponse.json({ error: 'FX quoting is not configured yet' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const base = (searchParams.get('base') ?? '').toUpperCase();
  const quote = (searchParams.get('quote') ?? '').toUpperCase();
  if (!ALLOWED.has(base) || !ALLOWED.has(quote) || base === quote) {
    return NextResponse.json(
      { error: "Invalid base/quote. Try base=USD quote=NGN" },
      { status: 422 },
    );
  }

  const cacheKey = `graph:fx:${base}:${quote}`;

  let raw: Awaited<ReturnType<typeof fetchGraphRate>> | null = null;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) raw = JSON.parse(cached) as typeof raw;
  } catch { /* swallow */ }

  if (!raw) {
    try {
      raw = await fetchGraphRate(base, quote);
      try {
        await redis.set(cacheKey, JSON.stringify(raw), 'EX', CACHE_TTL_SECONDS);
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : err },
          '[fx/quote] Redis cache write failed',
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ base, quote, err: msg }, '[fx/quote] Graph rate fetch failed');
      return NextResponse.json(
        { error: 'Could not fetch FX quote', detail: msg },
        { status: 502 },
      );
    }
  }

  const markupBps = await getMarkupBps();
  const midRate = raw!.rate;
  // Sell-side effective rate: subtract markup so user gets fewer NGN per USD
  const effectiveRate = midRate * (1 - markupBps / 10_000);

  return NextResponse.json({
    base_currency: base,
    quote_currency: quote,
    midRate,
    markupBps,
    effectiveRate,
    rate_id: raw!.rate_id ?? null,
    timestamp: raw!.timestamp ?? new Date().toISOString(),
    expires_at: raw!.expires_at ?? null,
  });
}
