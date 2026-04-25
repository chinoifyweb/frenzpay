/**
 * POST /api/reports/proof-of-account
 *
 * Customer requests a "Proof of account ownership" PDF emailed to them.
 *
 * Today this is a stub — it queues a row for ops to manually fulfil
 * (and audit-logs the request) so we don't 404 the dashboard button
 * while the PDF generation pipeline is still being wired up. Once
 * that lands, replace the inline `audit + email queue` body with the
 * real PDF-generation call and return the document or signed URL.
 *
 * Body: { currency: 'USD' | 'EUR' | 'NGN' | 'USDC' }
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  currency: z.enum(['USD', 'EUR', 'NGN', 'USDC']),
});

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Pick a supported currency.' }, { status: 422 });
  }

  // Audit + queue marker. Until the PDF pipeline lands, ops checks
  // audit_logs filtered by action=PROOF_OF_ACCOUNT_REQUESTED and
  // emails the customer manually within the SLA promised in the UI
  // ("a few minutes").
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'PROOF_OF_ACCOUNT_REQUESTED',
      resourceType: 'User',
      resourceId: session.userId,
      metadata: { currency: parsed.data.currency },
    },
  }).catch((err) =>
    logger.warn(
      { userId: session.userId, err: err instanceof Error ? err.message : err },
      'proof-of-account audit log failed',
    ),
  );

  return NextResponse.json({ ok: true, status: 'queued' });
}
