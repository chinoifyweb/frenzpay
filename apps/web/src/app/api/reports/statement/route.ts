/**
 * POST /api/reports/statement
 *
 * Customer requests a statement-of-account PDF for a date range.
 *
 * Stub — queues an audit row + lets ops fulfill manually. Replace the
 * body with real PDF generation when the pipeline lands.
 *
 * Body:
 *   { currency: 'ALL'|'USD'|'EUR'|'NGN'|'USDC',
 *     range: '30'|'90'|'180'|'365'|'custom',
 *     fromDate?: 'YYYY-MM-DD',
 *     toDate?: 'YYYY-MM-DD' }
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  currency: z.enum(['ALL', 'USD', 'EUR', 'NGN', 'USDC']),
  range: z.enum(['30', '90', '180', '365', 'custom']),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  toDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  const { range, fromDate, toDate } = parsed.data;
  if (range === 'custom' && (!fromDate || !toDate)) {
    return NextResponse.json({ error: 'Custom range needs both from and to dates.' }, { status: 422 });
  }

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'STATEMENT_REQUESTED',
      resourceType: 'User',
      resourceId: session.userId,
      metadata: { ...parsed.data },
    },
  }).catch((err) =>
    logger.warn(
      { userId: session.userId, err: err instanceof Error ? err.message : err },
      'statement audit log failed',
    ),
  );

  return NextResponse.json({ ok: true, status: 'queued' });
}
