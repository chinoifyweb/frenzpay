/**
 * POST /api/admin/users/[id]/freeze
 * Admin break-glass: freeze a user account (e.g. for sanctions match, fraud
 * investigation, ToS violation).
 *
 * Body: { totpCode: string, reason: string }
 *
 * Effects:
 *   - User.status = SUSPENDED
 *   - All active Redis sessions for that user are deleted (force logout)
 *   - Frozen users cannot send, withdraw, issue cards, or create links
 *   - AuditLog entry written with admin ID + reason
 *
 * User notification (email) should be sent by a downstream worker on the
 * resulting AuditLog entry — not coupled to this request path.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { gateAdminOp } from '@/lib/admin-mfa';
import { deleteAllUserSessions } from '@/lib/session';

const Schema = z.object({
  totpCode: z.string().regex(/^\d{6}$/),
  reason: z.string().min(20).max(500),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await requireRole('admin');
  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const gate = await gateAdminOp({
    adminUserId: session.userId,
    totpCode: parsed.data.totpCode,
    reason: parsed.data.reason,
  });
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  // Prevent admins from freezing themselves
  if (id === session.userId) {
    return NextResponse.json({ error: 'Admins cannot freeze their own account via this endpoint.' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id }, select: { id: true, email: true, status: true },
  });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.status === 'SUSPENDED') {
    return NextResponse.json({ ok: true, alreadyFrozen: true });
  }

  await prisma.$transaction(async (tx: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tx as any;
    await t.user.update({ where: { id }, data: { status: 'SUSPENDED' } });
    await t.auditLog.create({
      data: {
        userId: session.userId,      // actor (admin)
        action: 'ADMIN_USER_FROZEN',
        resourceType: 'User',
        resourceId: id,
        metadata: {
          targetUserEmail: target.email,
          reason: parsed.data.reason,
          previousStatus: target.status,
        },
      },
    });
  });

  // Force-logout the user from all devices
  await deleteAllUserSessions(id);

  return NextResponse.json({
    ok: true,
    userId: id,
    newStatus: 'SUSPENDED',
    message: 'Account frozen. User has been logged out of all sessions.',
  });
}
