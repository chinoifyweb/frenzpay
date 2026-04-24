// Force dynamic — these routes read cookies/headers and must never be statically rendered.
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/audit
 *
 * Returns the most recent entries from admin_audit_logs. Read-only by design —
 * audit logs are immutable. If you need to "correct" an entry, append a new one.
 *
 * Query params:
 *   - limit: 1..200 (default 50)
 *   - cursor: admin_audit_logs.id (as string — the column is bigint) to page
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';

export async function GET(req: NextRequest) {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 50), 1), 200);
  const cursor = searchParams.get('cursor');

  const rows = await prisma.adminAuditLog.findMany({
    orderBy: { id: 'desc' },
    take: limit,
    ...(cursor
      ? { skip: 1, cursor: { id: BigInt(cursor) } }
      : {}),
    select: {
      id: true,
      action: true,
      resourceType: true,
      resourceId: true,
      targetUserId: true,
      metadata: true,
      createdAt: true,
      admin: { select: { email: true } },
    },
  });

  return NextResponse.json({
    entries: rows.map((r: (typeof rows)[number]) => ({
      id: r.id.toString(),
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      targetUserId: r.targetUserId,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
      adminEmail: r.admin?.email ?? 'unknown',
    })),
    pagination: {
      limit,
      hasMore: rows.length === limit,
      nextCursor: rows.length === limit ? rows[rows.length - 1].id.toString() : null,
    },
  });
}
