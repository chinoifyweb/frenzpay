// Force dynamic — these routes read cookies/headers and must never be statically rendered.
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/users/[id]/unfreeze
 * Reverse a previous freeze. Same TOTP + reason gate.
 * Does NOT affect user-initiated self-freezes (panic button) — those require
 * the user to contact support and go through a separate recovery flow.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { gateAdminOp } from '@/lib/admin-mfa';

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

  const target = await prisma.user.findUnique({
    where: { id }, select: { id: true, email: true, status: true },
  });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Only unfreeze admin-initiated SUSPENDED states. FROZEN (user self-freeze)
  // must go through account-recovery, not an admin button.
  if (target.status !== 'SUSPENDED') {
    return NextResponse.json(
      {
        error: `User status is ${target.status}. Only SUSPENDED accounts can be unfrozen by admin. Self-frozen (FROZEN) accounts must recover via email.`,
      },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tx as any;
    await t.user.update({ where: { id }, data: { status: 'ACTIVE' } });
    await t.auditLog.create({
      data: {
        userId: session.userId,
        action: 'ADMIN_USER_UNFROZEN',
        resourceType: 'User',
        resourceId: id,
        metadata: {
          targetUserEmail: target.email,
          reason: parsed.data.reason,
        },
      },
    });
  });

  return NextResponse.json({ ok: true, userId: id, newStatus: 'ACTIVE' });
}
