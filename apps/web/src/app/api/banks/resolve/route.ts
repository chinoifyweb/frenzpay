/**
 * POST /api/banks/resolve
 *
 * Verify an NGN bank account before a customer saves it as a beneficiary
 * (or before an admin approves a payout). Returns the registered account
 * holder name so the UI can confirm it matches the user's expectation.
 *
 * Body: { bank_code: string, account_number: string }
 * Response: { account_name, bank_name, bank_code, account_number }
 *
 * Rate-limited per session at 30 calls / minute to prevent enumeration of
 * random account numbers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { resolveGraphBankAccount } from '@frenzpay/providers/graph';
import { redis } from '@/lib/redis';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  bank_code: z.string().min(3).max(10),
  account_number: z.string().regex(/^\d{10}$/, 'NGN account numbers are exactly 10 digits'),
});

const RATE_LIMIT_PER_MINUTE = 30;

async function rateLimit(userId: string): Promise<boolean> {
  const key = `rl:bank-resolve:${userId}:${Math.floor(Date.now() / 60_000)}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 70);
    return count <= RATE_LIMIT_PER_MINUTE;
  } catch {
    // If Redis is down, allow through — we'd rather resolve than block users
    return true;
  }
}

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  if (!(await rateLimit(session.userId))) {
    return NextResponse.json(
      { error: 'Too many resolve requests. Slow down.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  try {
    const result = await resolveGraphBankAccount({
      bank_code: parsed.data.bank_code,
      account_number: parsed.data.account_number,
      currency: 'NGN',
    });
    return NextResponse.json({
      account_name: result.account_name,
      bank_name: result.bank_name ?? null,
      bank_code: result.bank_code,
      account_number: result.account_number,
      currency: result.currency,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg, userId: session.userId }, '[banks/resolve] Graph resolve failed');
    // 422 rather than 502 — most failures are "account not found" which is a
    // user-fixable issue, not an upstream outage.
    return NextResponse.json(
      { error: 'Could not verify that account. Double-check the bank and account number.' },
      { status: 422 },
    );
  }
}
