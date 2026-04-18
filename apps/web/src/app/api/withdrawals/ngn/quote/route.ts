/**
 * POST /api/withdrawals/ngn/quote
 * Preview an NGN withdrawal quote without actually initiating the payout.
 *
 * Body: { sourceCurrency: "USD"|"USDC", sourceAmountMinor: "10000" }
 *
 * Returns the exact rate + fees + NGN payout amount the user will see at
 * confirmation time. The rate is NOT locked — real production would return a
 * short-lived quote token and enforce it on POST, but for Phase 6 the quote
 * is purely informational.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import {
  convertMinor,
  getFxMarkupBps,
  getFxRateMicro,
  getWithdrawalFeeMinor,
  type FxCurrency,
} from '@/lib/fx';

const Schema = z.object({
  sourceCurrency: z.enum(['USD', 'USDC']),
  sourceAmountMinor: z.string().regex(/^[1-9][0-9]*$/),
});

export async function POST(req: NextRequest) {
  await requireSession();

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const sourceAmountMinor = BigInt(parsed.data.sourceAmountMinor);
  const sourceCurrency = parsed.data.sourceCurrency as FxCurrency;

  const feeMinor = getWithdrawalFeeMinor(sourceCurrency);

  if (sourceAmountMinor <= feeMinor) {
    return NextResponse.json(
      { error: `Amount must exceed the ${feeMinor.toString()} minor-unit fee.` },
      { status: 422 },
    );
  }

  // Fee is deducted from source BEFORE FX conversion.
  const netSourceMinor = sourceAmountMinor - feeMinor;

  // Scale USDC (6 decimals) down to 2-decimal parity for NGN kobo output
  // so the rate constants remain `1 USD -> 1600 NGN`.
  const scaledSource =
    sourceCurrency === 'USDC'
      ? netSourceMinor / 10_000n // USDC minor (6dp) → cent-equivalent (2dp)
      : netSourceMinor;

  const conversion = convertMinor({
    sourceAmountMinor: scaledSource,
    from: sourceCurrency,
    to: 'NGN',
  });

  const midRateMicro = getFxRateMicro(sourceCurrency, 'NGN');

  return NextResponse.json({
    source: {
      currency: sourceCurrency,
      amountMinor: sourceAmountMinor.toString(),
      feeMinor: feeMinor.toString(),
      netAmountMinor: netSourceMinor.toString(),
    },
    destination: {
      currency: 'NGN',
      amountMinor: conversion.destAmountMinor.toString(),
    },
    rate: {
      midMicro: midRateMicro.toString(),
      afterMarkupMicro: conversion.rateMicroAfterMarkup.toString(),
      markupBps: conversion.markupBps,
      displayMidRate: Number(midRateMicro) / 1_000_000,
      displayEffectiveRate: Number(conversion.rateMicroAfterMarkup) / 1_000_000,
    },
    defaultMarkupBps: getFxMarkupBps(),
  });
}
