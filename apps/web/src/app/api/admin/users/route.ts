/**
 * GET /api/admin/users — paginated user list with filters
 * Query: ?q=email&status=ACTIVE|FROZEN|SUSPENDED&tier=T0|T1|T2|T3&page=1
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/session';
import { prisma } from '@frenzpay/db';

export async function GET(req: NextRequest) {
  await requireRole('admin');
  const { searchParams } = req.nextUrl;

  const q = searchParams.get('q')?.trim();
  const status = searchParams.get('status');
  const tier = searchParams.get('tier');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20', 10));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (q) where.email = { contains: q, mode: 'insensitive' };
  if (status) where.status = status;
  if (tier) where.kycTier = tier;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where, orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit, take: limit,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        status: true, kycTier: true, kycStatus: true, createdAt: true,
        frenzTag: { select: { tag: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    users: users.map((u: any) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      frenzTag: u.frenzTag?.tag ?? null,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
