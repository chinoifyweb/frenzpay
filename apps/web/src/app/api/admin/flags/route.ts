/**
 * GET /api/admin/flags
 *
 * Returns recent fraud-engine flags (audit_logs rows where action starts with
 * FRAUD_), plus their resolution status. A flag is "resolved" iff there is a
 * corresponding admin_audit_logs entry with action=FRAUD_RESOLVED and
 * resourceId equal to the flag's audit_log id.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/session';
import { prisma } from '@frenzpay/db';

export async function GET(req: NextRequest) {
  await requireRole('admin');
  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '30', 10));

  const [flags, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        action: { startsWith: 'FRAUD_' },
        NOT: { action: 'FRAUD_RESOLVED' }, // resolution events live on admin_audit_logs
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        userId: true,
        action: true,
        metadata: true,
        createdAt: true,
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    }),
    prisma.auditLog.count({
      where: {
        action: { startsWith: 'FRAUD_' },
        NOT: { action: 'FRAUD_RESOLVED' },
      },
    }),
  ]);

  // Look up resolutions — resourceId on admin_audit_logs holds the bigint
  // flag id stored as a string.
  const flagIds = flags.map((f: (typeof flags)[number]) => f.id.toString());
  const resolutions =
    flagIds.length > 0
      ? await prisma.adminAuditLog.findMany({
          where: {
            action: 'FRAUD_RESOLVED',
            resourceType: 'FraudFlag',
            resourceId: { in: flagIds },
          },
          select: {
            resourceId: true,
            createdAt: true,
            metadata: true,
            admin: { select: { email: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];

  // If a flag was resolved more than once, keep the newest.
  const resolutionMap = new Map<
    string,
    { resolvedAt: string; resolvedBy: string; note: string | null }
  >();
  for (const r of resolutions) {
    if (!r.resourceId) continue;
    if (resolutionMap.has(r.resourceId)) continue;
    const md = (r.metadata ?? {}) as { note?: string };
    resolutionMap.set(r.resourceId, {
      resolvedAt: r.createdAt.toISOString(),
      resolvedBy: r.admin?.email ?? 'unknown',
      note: md.note ?? null,
    });
  }

  return NextResponse.json({
    flags: flags.map((f: (typeof flags)[number]) => {
      const idStr = f.id.toString();
      const resolution = resolutionMap.get(idStr) ?? null;
      return {
        id: idStr,
        userId: f.userId,
        email: f.user?.email ?? null,
        name:
          `${f.user?.firstName ?? ''} ${f.user?.lastName ?? ''}`.trim() || null,
        action: f.action,
        metadata: f.metadata,
        createdAt: f.createdAt.toISOString(),
        resolved: resolution !== null,
        resolution,
      };
    }),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
