/**
 * GET /api/admin/accounts
 *
 * Admin list of every provisioned virtual account (UserExternalAccount
 * rows of type='virtual_account'). Joined with the customer for the
 * email + display name. Filterable by currency + status.
 *
 * Used by the /admin/accounts page so reviewers can see what's been
 * provisioned, what's still pending upstream at the rail, and which
 * customer each account belongs to.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';

const VALID_CURRENCIES = new Set(['USD', 'EUR', 'NGN']);
const VALID_STATUSES = new Set(['active', 'pending', 'suspended', 'closed', 'success']);

export async function GET(req: NextRequest) {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const currency = searchParams.get('currency');
  const status = searchParams.get('status');
  const q = (searchParams.get('q') ?? '').trim().toLowerCase();
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '25', 10));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { type: 'virtual_account' };
  if (currency && VALID_CURRENCIES.has(currency)) where.currency = currency;
  if (status && VALID_STATUSES.has(status)) where.status = status;
  if (q) {
    where.OR = [
      { user: { email: { contains: q, mode: 'insensitive' } } },
      { user: { firstName: { contains: q, mode: 'insensitive' } } },
      { user: { lastName: { contains: q, mode: 'insensitive' } } },
      { externalAccountId: { contains: q, mode: 'insensitive' } },
      { accountNumber: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.userExternalAccount.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        userId: true,
        provider: true,
        externalAccountId: true,
        currency: true,
        accountName: true,
        accountNumber: true,
        routingNumber: true,
        bankName: true,
        status: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            kycTier: true,
          },
        },
      },
    }),
    prisma.userExternalAccount.count({ where }),
  ]);

  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accounts: rows.map((r: any) => ({
      id: r.id,
      provider: r.provider,
      externalAccountId: r.externalAccountId,
      currency: r.currency,
      accountName: r.accountName,
      accountNumber: r.accountNumber,
      routingNumber: r.routingNumber,
      bankName: r.bankName,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      user: {
        id: r.user.id,
        email: r.user.email,
        displayName: `${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim() || r.user.email,
        kycTier: r.user.kycTier,
      },
    })),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
}
