// Force dynamic — reads session cookie.
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/card-fee/run
 *
 * Kick the monthly-card-fee job on demand. Same code path as the cron
 * trigger — idempotent, safe to re-run. Useful for testing fresh card fee
 * settings without waiting for the 1st.
 *
 * Admin-only.
 */

import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { monthlyCardFee } from '@/workers/jobs/monthly-card-fee';
import { logger } from '@frenzpay/logger';

export async function POST() {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  logger.info({ adminId: session.userId }, 'admin-triggered monthly card fee run');

  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId: session.userId,
        action: 'CARD_FEE_MANUAL_RUN',
        resourceType: 'System',
      },
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      'failed to write admin audit log before manual card-fee run (non-fatal)',
    );
  }

  try {
    await monthlyCardFee();
    return NextResponse.json({
      ok: true,
      message: 'Card-fee job completed. Check worker logs for detail.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, 'manual card fee run failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
