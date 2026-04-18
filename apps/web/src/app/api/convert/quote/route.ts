/**
 * GET /api/convert/quote?from=USD&to=NGN&amount=10000
 *
 * Preview-only quote for a currency conversion. Returns the expected
 * destination amount, fee, and the rate after FX markup. Does NOT require a
 * PIN and does NOT move any money.
 *
 * Query params:
 *   from   — "USD" | "NGN" | "USDC"
 *   to     — "USD" | "NGN" | "USDC"  (≠ from)
 *   amount — positive BigInt string in source minor units
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import {
  convertMinor,
  getFxMarkupBps,
  type FxCurrency,
} from '@/lib/fx';

const VALID = new Set<FxCurrency>(['USD', 'NGN', 'USDC']);

function getConvertFeeMinor(from: FxCurrency): bigint {
  const envKey = `CONVERT_FEE_${from}_MINOR`;
  const envVal = process.env[envKey];
  if (envVal) { try { return BigInt(envVal); } catch { /* fall through */ } }
  if (from === 'USD')  return 50n;
  if (from === 'USDC') return 500_000n;
  if (from === 'NGN')  return 50_000n;
  return 0n;
}

function getMinConvertMinor(from: FxCurrency): bigint {
  if (from === 'USD')  return 100n;
  if (from === 'USDC') return 1_000_000n;
  if (from === 'NGN')  return 100_000n;
  return 0n;
}

export async function GET(req: NextRequest) {
  await requireSession();

  const { searchParams } = new URL(req.url);
  const from = (searchParams.get('from') ?? '').toUpperCase() as FxCurrency;
  const to   = (searchParams.get('to')   ?? '').toUpperCase() as FxCurrency;
  const amountStr = (searchParams.get('amount') ?? '').trim();

  if (!VALID.has(from) || !VALID.has(to)) {
    return NextResponse.json({ error: 'Invalid currency. Use USD, NGN, or USDC.' }, { status: 422 });
  }
  if (from === to) {
    return NextResponse.json({ error: 'Source and destination must differ.' }, { status: 422 });
  }
  if (from === 'USDC' || to === 'USDC') {
    return NextResponse.json({ error: 'USDC conversions are coming soon.' }, { status: 422 });
  }
  if (!/^[1-9][0-9]*$/.test(amountStr)) {
    return NextResponse.json({ error: 'amount must be a positive integer (minor units).' }, { status: 422 });
  }

  const sourceAmount = BigInt(amountStr);
  const minMinor = getMinConvertMinor(from);
  const feeMinor = getConvertFeeMinor(from);

  if (sourceAmount < minMinor) {
    return NextResponse.json(
      {
        error: `Amount is below the minimum.`,
        minMinor: minMinor.toString(),
      },
      { status: 422 },
    );
  }
  if (sourceAmount <= feeMinor) {
    return NextResponse.json(
      { error: 'Amount must exceed the conversion fee.', feeMinor: feeMinor.toString() },
      { status: 422 },
    );
  }

  const netSource = sourceAmount - feeMinor;
  const markupBps = getFxMarkupBps();
  const conv = convertMinor({
    sourceAmountMinor: netSource,
    from,
    to,
    markupBps,
  });

  return NextResponse.json({
    fromCurrency: from,
    toCurrency: to,
    sourceAmountMinor: sourceAmount.toString(),
    feeMinor: feeMinor.toString(),
    netSourceMinor: netSource.toString(),
    destAmountMinor: conv.destAmountMinor.toString(),
    fxRateMicroAfterMarkup: conv.rateMicroAfterMarkup.toString(),
    fxMarkupBps: markupBps,
    minMinor: minMinor.toString(),
  });
}
