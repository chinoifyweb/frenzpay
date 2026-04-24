// Force dynamic — reads session cookie.
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/maintenance-fee/run
 *
 * Kick the monthly-maintenance-fee job on-demand. Same code path as the cron
 * trigger so behaviour matches exactly. Useful for testing a fresh fee
 * setting without waiting for the 1st of the month.
 *
 * Idempotent: already-charged users this month are skipped, users with
 * insufficient balance are skipped, so a manual run is safe to re-trigger.
 *
 * Admin-only.
 */

import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { monthlyMaintenanceFee } from '@/workers/jobs/monthly-maintenance-fee';
import { logger } from '@frenzpay/logger';

export async function POST() {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  logger.info({ adminId: session.userId }, 'admin-triggered monthly maintenance fee run');

  // Write an audit entry BEFORE running so we can trace who kicked it.
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId: session.userId,
        action: 'MAINTENANCE_FEE_MANUAL_RUN',
        resourceType: 'System',
      },
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      'failed to write admin audit log before manual maintenance run (non-fatal)',
    );
  }

  try {
    await monthlyMaintenanceFee();
    return NextResponse.json({ ok: true, message: 'Maintenance-fee job completed. Check worker logs for detail.' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, 'manual maintenance fee run failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
