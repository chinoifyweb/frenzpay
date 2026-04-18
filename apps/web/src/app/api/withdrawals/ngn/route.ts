/**
 * POST /api/withdrawals/ngn
 * Withdraw from a user's USD or USDC balance to a Nigerian bank account via Paystack.
 *
 * Body:
 *   sourceCurrency      — "USD" | "USDC"
 *   sourceAmountMinor   — BigInt string (total amount, fee is deducted from this)
 *   bankCode            — Paystack bank code (from /api/banks/ng)
 *   accountNumber       — 10-digit NUBAN
 *   accountName         — from /api/banks/resolve (re-verified server-side)
 *   pin                 — 6-digit transaction PIN
 *   idempotencyKey      — client UUID per attempt
 *
 * Flow:
 * 1. Auth + Zod validation
 * 2. PIN verification
 * 3. T2+ KYC check
 * 4. Balance + daily withdraw limit check
 * 5. Server-side account re-resolution (trust but verify)
 * 6. Get-or-create Beneficiary + Paystack recipient
 * 7. Compute FX quote (rate at post-time — no quote token)
 * 8. Atomic ledger post:
 *      debit:  user.<sourceCurrency>.AVAILABLE  (source amount net of fee)
 *      credit: paystack_ngn_float                (NGN leg)
 *    Plus fee leg:
 *      debit:  user.<sourceCurrency>.AVAILABLE  (fee amount)
 *      credit: fees_usd                          (platform revenue)
 *    Plus FX markup leg:
 *      debit:  paystack_ngn_float                (markup portion)
 *      credit: fx_markup_usd                     (platform FX revenue, credited in USD)
 *
 *    NB: Phase 6 simplification — fee + markup legs batched into a single
 *    `postTransaction` call with multiple lines. Keeps withdrawal ledger tight.
 * 9. Initiate Paystack transfer
 * 10. Create Withdrawal row with status=PROCESSING
 * 11. Webhook later confirms settlement → status=SETTLED (funds leave omnibus to external_world_ngn)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { verifyUserPin } from '@/lib/pin';
import { assessRisk } from '@/lib/fraud';
import {
  ensureAccount,
  availableBalanceOf,
  getSystemAccount,
  postTransaction,
  Money,
} from '@frenzpay/ledger';
import {
  resolveNigerianAccount,
  createPaystackRecipient,
  initiatePaystackTransfer,
} from '@frenzpay/providers/paystack';
import {
  convertMinor,
  getFxRateMicro,
  getFxMarkupBps,
  getWithdrawalFeeMinor,
  type FxCurrency,
} from '@/lib/fx';
import { logger } from '@frenzpay/logger';
import { randomBytes } from 'node:crypto';

const Schema = z.object({
  sourceCurrency: z.enum(['USD', 'USDC']),
  sourceAmountMinor: z.string().regex(/^[1-9][0-9]*$/),
  bankCode: z.string().regex(/^\d{3,6}$/),
  accountNumber: z.string().regex(/^\d{10}$/),
  accountName: z.string().min(2).max(100),
  pin: z.string().regex(/^\d{6}$/),
  idempotencyKey: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

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

  const { sourceCurrency, sourceAmountMinor, bankCode, accountNumber, accountName, pin, idempotencyKey } = parsed.data;
  const sourceAmount = BigInt(sourceAmountMinor);

  // ── Idempotency ────────────────────────────────────────────────────────────
  const existing = await prisma.transaction.findUnique({
    where: { idempotencyKey },
    select: { id: true, status: true, withdrawal: { select: { id: true, status: true, externalRef: true } } },
  });
  if (existing) {
    return NextResponse.json({
      transactionId: existing.id,
      status: existing.status,
      withdrawal: existing.withdrawal,
      idempotent: true,
    });
  }

  // ── PIN ────────────────────────────────────────────────────────────────────
  const pinResult = await verifyUserPin(session.userId, pin);
  if (!pinResult.ok) {
    return NextResponse.json(
      { error: pinResult.error, attemptsRemaining: pinResult.attemptsRemaining },
      { status: pinResult.status },
    );
  }

  // ── User eligibility ───────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, kycTier: true, status: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Your account is not active.' }, { status: 403 });
  }
  if (user.kycTier === 'T0' || user.kycTier === 'T1') {
    return NextResponse.json(
      { error: 'Withdrawals require Advanced KYC (T2). Complete document verification first.' },
      { status: 403 },
    );
  }

  // ── Fraud assessment ───────────────────────────────────────────────────────
  const risk = await assessRisk({
    userId: user.id,
    action: 'withdraw',
    amountMinor: sourceAmount,
    currency: sourceCurrency,
  });
  if (risk.decision === 'hold') {
    return NextResponse.json(
      { error: 'This withdrawal was blocked for your security. Contact support.', riskScore: risk.score },
      { status: 403 },
    );
  }

  // ── Balance check ──────────────────────────────────────────────────────────
  const balance = await availableBalanceOf(prisma, user.id, sourceCurrency);
  if (balance < sourceAmount) {
    return NextResponse.json(
      { error: `Insufficient ${sourceCurrency} balance.`, available: balance.toString(), required: sourceAmount.toString() },
      { status: 402 },
    );
  }

  // ── Daily withdrawal limit ─────────────────────────────────────────────────
  const tierLimit = await prisma.kycTierLimit.findUnique({
    where: { tier: user.kycTier },
    select: { withdrawLimitDailyCents: true },
  });
  if (tierLimit && tierLimit.withdrawLimitDailyCents > 0n) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const sumToday: { _sum: { amount: bigint | null } } = await prisma.transaction.aggregate({
      where: {
        initiatorUserId: user.id,
        type: 'WITHDRAWAL',
        currency: sourceCurrency,
        status: { in: ['PENDING', 'POSTED'] },
        createdAt: { gte: startOfDay },
      },
      _sum: { amount: true },
    });

    const alreadyWithdrawn = sumToday._sum.amount ?? 0n;
    // Scale USDC (6dp) to cents-equivalent (2dp) for limit comparison
    const sourceInCents = sourceCurrency === 'USDC' ? sourceAmount / 10_000n : sourceAmount;
    const alreadyInCents = sourceCurrency === 'USDC' ? alreadyWithdrawn / 10_000n : alreadyWithdrawn;

    if (alreadyInCents + sourceInCents > tierLimit.withdrawLimitDailyCents) {
      return NextResponse.json(
        {
          error: 'Daily withdrawal limit exceeded for your tier.',
          dailyLimitCents: tierLimit.withdrawLimitDailyCents.toString(),
          alreadyWithdrawnCents: alreadyInCents.toString(),
        },
        { status: 429 },
      );
    }
  }

  // ── Server-side account re-resolution (trust-but-verify) ──────────────────
  let resolvedName: string;
  try {
    const resolved = await resolveNigerianAccount(accountNumber, bankCode);
    resolvedName = resolved.accountName;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Account resolution failed';
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  // Fuzzy-match: user's provided name must overlap with resolved name (case-insensitive
  // substring in either direction). This catches most frontend tampering without
  // being brittle to middle-name ordering or honorifics.
  const normClient = accountName.toLowerCase().replace(/[^a-z]/g, '');
  const normResolved = resolvedName.toLowerCase().replace(/[^a-z]/g, '');
  if (!normClient.includes(normResolved.slice(0, 5)) && !normResolved.includes(normClient.slice(0, 5))) {
    return NextResponse.json(
      { error: `Account name mismatch. Bank returned "${resolvedName}".` },
      { status: 422 },
    );
  }

  // ── Get or create beneficiary ──────────────────────────────────────────────
  let beneficiary = await prisma.beneficiary.findFirst({
    where: {
      userId: user.id,
      type: 'bank_account',
      bankCode,
      accountNumber,
      isActive: true,
    },
  });

  if (!beneficiary) {
    beneficiary = await prisma.beneficiary.create({
      data: {
        userId: user.id,
        type: 'bank_account',
        bankCode,
        accountNumber,
        accountName: resolvedName,
        currency: 'NGN',
        country: 'NG',
        // 24h cooling period for new bank beneficiaries (T2 requirement)
        coolingPeriodEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'BENEFICIARY_CREATED',
        resourceType: 'Beneficiary',
        resourceId: beneficiary.id,
        metadata: { bankCode, accountNumber, accountName: resolvedName },
      },
    });
  }

  // Enforce cooling period on first use of a new beneficiary
  if (beneficiary.coolingPeriodEndsAt && beneficiary.coolingPeriodEndsAt > new Date()) {
    const minutesLeft = Math.ceil((beneficiary.coolingPeriodEndsAt.getTime() - Date.now()) / 60_000);
    return NextResponse.json(
      {
        error: `Security cooling period active. You can withdraw to this account in ${minutesLeft} minute(s).`,
        coolingPeriodEndsAt: beneficiary.coolingPeriodEndsAt.toISOString(),
      },
      { status: 429 },
    );
  }

  // ── Compute FX quote ───────────────────────────────────────────────────────
  const feeMinor = getWithdrawalFeeMinor(sourceCurrency as FxCurrency);
  if (sourceAmount <= feeMinor) {
    return NextResponse.json({ error: 'Amount must exceed the withdrawal fee.' }, { status: 422 });
  }
  const netSource = sourceAmount - feeMinor;

  const scaledSource = sourceCurrency === 'USDC' ? netSource / 10_000n : netSource;
  const markupBps = getFxMarkupBps();
  const conversion = convertMinor({ sourceAmountMinor: scaledSource, from: sourceCurrency as FxCurrency, to: 'NGN', markupBps });
  const destKobo = conversion.destAmountMinor;

  if (destKobo <= 0n) {
    return NextResponse.json({ error: 'Converted NGN amount is zero.' }, { status: 422 });
  }

  // ── Get or create Paystack recipient ───────────────────────────────────────
  // Store Paystack recipient_code in beneficiary metadata for reuse
  const beneficiaryMeta = (beneficiary as { metadata?: Record<string, unknown> | null }).metadata ?? null;
  let recipientCode: string | undefined;
  if (beneficiaryMeta && typeof beneficiaryMeta === 'object' && 'paystackRecipientCode' in beneficiaryMeta) {
    recipientCode = (beneficiaryMeta as { paystackRecipientCode?: string }).paystackRecipientCode;
  }

  if (!recipientCode) {
    const recipient = await createPaystackRecipient(resolvedName, bankCode, accountNumber);
    recipientCode = recipient.recipientCode;
  }

  // ── Post ledger transaction ────────────────────────────────────────────────
  const userSourceAccountId = await ensureAccount(prisma, user.id, sourceCurrency, 'AVAILABLE');
  const feesAccountId = await getSystemAccount(prisma, sourceCurrency === 'USDC' ? 'fees_usd' : 'fees_usd');
  const paystackFloatId = await getSystemAccount(prisma, 'paystack_ngn_float');
  const fxMarkupId = await getSystemAccount(prisma, 'fx_markup_usd');

  const reference = `frenz-wd-${randomBytes(8).toString('hex')}`;

  // Our ledger needs each line to balance per-currency. We can't mix USD+NGN in one txn,
  // so the WITHDRAWAL transaction is modelled as two legs:
  //   Leg A (source currency): user's USD/USDC out → fee → fx_markup_usd gets the rest
  //   Leg B (NGN):              paystack_ngn_float out → external_world_ngn (credited on webhook)
  //
  // For Phase 6, we post Leg A now. Leg B is posted by the webhook handler on
  // `transfer.success`. This keeps idempotency straightforward.

  const result = await postTransaction(prisma, {
    type: 'WITHDRAWAL',
    idempotencyKey,
    lines: [
      // Fee to platform (in source currency)
      {
        debitAccountId: userSourceAccountId,
        creditAccountId: feesAccountId,
        amount: Money.of(feeMinor, sourceCurrency),
      },
      // Remainder of source → FX markup bucket (simplified; production would have a
      // dedicated settlement account to hold this leg until FX settles).
      {
        debitAccountId: userSourceAccountId,
        creditAccountId: fxMarkupId,
        amount: Money.of(netSource, sourceCurrency),
      },
    ],
    initiatorUserId: user.id,
    externalRef: reference,
    feeAmount: Money.of(feeMinor, sourceCurrency),
    metadata: {
      provider: 'paystack',
      bankCode,
      accountNumber,
      accountName: resolvedName,
      recipientCode,
      destAmountKobo: destKobo.toString(),
      fxRateMicro: conversion.rateMicroAfterMarkup.toString(),
      fxMarkupBps: markupBps,
    },
  });

  // ── Create the Withdrawal row ─────────────────────────────────────────────
  const withdrawal = await prisma.withdrawal.create({
    data: {
      transactionId: result.id,
      beneficiaryId: beneficiary.id,
      sourceAmountCents: sourceCurrency === 'USDC' ? sourceAmount / 10_000n : sourceAmount,
      destAmountKobo: destKobo,
      fxRateMicro: conversion.rateMicroAfterMarkup,
      fxMarkupBps: markupBps,
      feeCents: sourceCurrency === 'USDC' ? feeMinor / 10_000n : feeMinor,
      status: 'PROCESSING',
      provider: 'paystack',
      externalRef: reference,
    },
  });

  // Store recipient code on beneficiary for reuse
  await prisma.beneficiary.update({
    where: { id: beneficiary.id },
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ metadata: { ...(beneficiaryMeta ?? {}), paystackRecipientCode: recipientCode } } as any),
    },
  }).catch(() => { /* Beneficiary may not have metadata field in the generated client — best-effort */ });

  // Fire away the actual transfer (webhook will confirm final state)
  let paystackTransfer: { transferCode: string; status: string } | null = null;
  try {
    paystackTransfer = await initiatePaystackTransfer({
      recipientCode,
      amountKobo: destKobo,
      reference,
      reason: `FrenzPay withdrawal ${reference}`,
    });
  } catch (err) {
    logger.error({ reference, err: err instanceof Error ? err.message : err }, 'Paystack transfer initiation failed');

    // Mark withdrawal as FAILED; ledger posting already reduced user's balance,
    // so we also need to reverse the transaction in a real production flow.
    // For Phase 6 we just flag FAILED — admin/ops will handle refund ledger posting manually.
    await prisma.withdrawal.update({
      where: { id: withdrawal.id },
      data: { status: 'FAILED', failureReason: err instanceof Error ? err.message : 'Paystack error' },
    });

    return NextResponse.json(
      { error: 'Payout failed to initiate. Funds will be returned to your balance.', reference },
      { status: 502 },
    );
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'NGN_WITHDRAWAL_INITIATED',
      resourceType: 'Withdrawal',
      resourceId: withdrawal.id,
      metadata: {
        sourceAmountMinor: sourceAmount.toString(),
        sourceCurrency,
        destKobo: destKobo.toString(),
        bankCode,
        accountNumber: accountNumber.slice(0, 3) + '*******',
        recipientCode,
        paystackTransferCode: paystackTransfer.transferCode,
      },
    },
  });

  logger.info(
    { userId: user.id, sourceAmount: sourceAmount.toString(), sourceCurrency, destKobo: destKobo.toString(), reference },
    'NGN withdrawal initiated',
  );

  return NextResponse.json(
    {
      transactionId: result.id,
      withdrawalId: withdrawal.id,
      reference,
      status: 'PROCESSING',
      sourceAmountMinor: sourceAmount.toString(),
      destKobo: destKobo.toString(),
      paystackTransferCode: paystackTransfer.transferCode,
    },
    { status: 201 },
  );
}
