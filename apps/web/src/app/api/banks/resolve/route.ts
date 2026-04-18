/**
 * GET /api/banks/resolve?bankCode=058&accountNumber=0123456789
 * Resolves a Nigerian account number against its bank via Paystack's name-resolution
 * endpoint. Returns the account holder's name for confirmation before payout.
 *
 * Rate-limited to 10 requests per minute per user (prevents enumeration).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { resolveNigerianAccount } from '@frenzpay/providers/paystack';
import { checkRateLimit } from '@frenzpay/auth/rate-limit';
import { redis } from '@/lib/redis';

export async function GET(req: NextRequest) {
  const { session } = await requireSession();
  const bankCode = req.nextUrl.searchParams.get('bankCode')?.trim();
  const accountNumber = req.nextUrl.searchParams.get('accountNumber')?.trim();

  if (!bankCode || !accountNumber) {
    return NextResponse.json(
      { error: 'bankCode and accountNumber are required' },
      { status: 400 },
    );
  }
  if (!/^\d{10}$/.test(accountNumber)) {
    return NextResponse.json(
      { error: 'accountNumber must be exactly 10 digits' },
      { status: 422 },
    );
  }
  if (!/^\d{3,6}$/.test(bankCode)) {
    return NextResponse.json({ error: 'Invalid bankCode' }, { status: 422 });
  }

  // Rate limit: 10 resolves per minute per user
  const rl = await checkRateLimit(redis, `rl:bank_resolve:user:${session.userId}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many resolution requests. Try again shortly.' },
      { status: 429 },
    );
  }

  try {
    const result = await resolveNigerianAccount(accountNumber, bankCode);
    return NextResponse.json({
      accountNumber: result.accountNumber,
      accountName: result.accountName,
      bankCode: result.bankCode,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Resolution failed';
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
