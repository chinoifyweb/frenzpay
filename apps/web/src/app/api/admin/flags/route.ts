/**
 * GET /api/admin/flags — recent fraud-engine flags (audit log entries)
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
      where: { action: { startsWith: 'FRAUD_' } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit, take: limit,
      select: {
        id: true, userId: true, action: true, metadata: true, createdAt: true,
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    }),
    prisma.auditLog.count({ where: { action: { startsWith: 'FRAUD_' } } }),
  ]);

  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    flags: flags.map((f: any) => ({
      id: f.id,
      userId: f.userId,
      email: f.user?.email ?? null,
      name: `${f.user?.firstName ?? ''} ${f.user?.lastName ?? ''}`.trim() || null,
      action: f.action,
      metadata: f.metadata,
      createdAt: f.createdAt.toISOString(),
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
