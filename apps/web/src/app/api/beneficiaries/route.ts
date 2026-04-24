// Force dynamic — reads the session cookie.
export const dynamic = 'force-dynamic';

/**
 * GET  /api/beneficiaries — list the caller's saved bank beneficiaries
 * POST /api/beneficiaries — save a Nigerian bank beneficiary
 *
 * NGN bank beneficiaries today. FrenzTag-based P2P beneficiaries live on
 * a separate flow.
 *
 * Body for POST:
 *   bank_code:      string (Graph NIP code, from GET /api/banks)
 *   account_number: string (10 digits)
 *   account_name:   string (optional — will be validated via resolve-on-blur)
 *   bank_name:      string (optional — caller may pass the display name)
 *
 * Dedup: a user can't save the same (bank_code, account_number) twice.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { logger } from '@frenzpay/logger';

const CreateSchema = z.object({
  bank_code: z.string().min(3).max(10),
  account_number: z.string().regex(/^\d{10}$/, 'NGN account numbers are 10 digits'),
  account_name: z.string().min(2).max(200).optional(),
  bank_name: z.string().min(2).max(200).optional(),
});

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET() {
  const { session } = await requireSession();

  const rows = await prisma.beneficiary.findMany({
    where: { userId: session.userId, isActive: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      bankCode: true,
      bankName: true,
      accountNumber: true,
      accountName: true,
      currency: true,
      country: true,
      coolingPeriodEndsAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    beneficiaries: rows.map((r: (typeof rows)[number]) => ({
      id: r.id,
      type: r.type,
      bankCode: r.bankCode,
      bankName: r.bankName,
      accountNumber: r.accountNumber,
      accountName: r.accountName,
      currency: r.currency,
      country: r.country,
      coolingPeriodEndsAt: r.coolingPeriodEndsAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

// ─── POST ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  // Dedup — same (bank_code, account_number) for this user + active
  const duplicate = await prisma.beneficiary.findFirst({
    where: {
      userId: session.userId,
      bankCode: parsed.data.bank_code,
      accountNumber: parsed.data.account_number,
      isActive: true,
    },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: 'You already saved this bank account.', beneficiaryId: duplicate.id },
      { status: 409 },
    );
  }

  // Cooling period for freshly-added bank beneficiaries: first withdrawal
  // to a new bank beneficiary is held for 24h (per tier rules). T3 users
  // can bypass; for MVP we apply a blanket 24h cool-down.
  const coolingEnds = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const created = await prisma.beneficiary.create({
    data: {
      userId: session.userId,
      type: 'bank_account',
      bankCode: parsed.data.bank_code,
      bankName: parsed.data.bank_name ?? null,
      accountNumber: parsed.data.account_number,
      accountName: parsed.data.account_name ?? null,
      currency: 'NGN',
      country: 'NG',
      coolingPeriodEndsAt: coolingEnds,
      isActive: true,
    },
    select: {
      id: true,
      bankCode: true,
      bankName: true,
      accountNumber: true,
      accountName: true,
      coolingPeriodEndsAt: true,
    },
  });

  logger.info(
    { userId: session.userId, beneficiaryId: created.id, bankCode: created.bankCode },
    'Bank beneficiary saved',
  );

  return NextResponse.json({
    beneficiary: {
      id: created.id,
      bankCode: created.bankCode,
      bankName: created.bankName,
      accountNumber: created.accountNumber,
      accountName: created.accountName,
      coolingPeriodEndsAt: created.coolingPeriodEndsAt?.toISOString() ?? null,
    },
  }, { status: 201 });
}
