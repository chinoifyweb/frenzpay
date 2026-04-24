// Force dynamic — reads session cookie.
export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/users — paginated user list with filters
 *   Query: ?q=email&status=ACTIVE|FROZEN|SUSPENDED&tier=T0|T1|T2|T3&page=1
 *
 * POST /api/admin/users — create a customer user as admin
 *   Body: { email, firstName, middleName, lastName, phone, password, country? }
 *
 *   Admin-created customers land in PENDING_KYC status (same as public
 *   signup) with email_verified = true (admin is the verifier). They still
 *   need to complete KYC before moving money. Useful for:
 *     - manual onboarding of a first client while the email delivery
 *       is being tuned
 *     - migrating existing customers from another system
 *   Writes an admin_audit_logs entry.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { encryptField, blindIndex } from '@frenzpay/crypto';
import { hashPassword } from '@frenzpay/auth';
import { logger } from '@frenzpay/logger';

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

// ── POST — admin creates a customer ─────────────────────────────────────────

const CreateSchema = z.object({
  email: z.string().email().max(320).toLowerCase(),
  firstName: z.string().min(1).max(50).trim(),
  middleName: z.string().min(2).max(60).trim(),
  lastName: z.string().min(1).max(50).trim(),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Invalid phone — include country code'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128)
    .refine((v) => /[A-Z]/.test(v) && /[a-z]/.test(v) && /[0-9]/.test(v), {
      message: 'Password needs upper, lower, and a number',
    }),
  country: z.string().length(2).optional(),
});

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  return `+${digits}`;
}

export async function POST(req: NextRequest) {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const phone = normalisePhone(parsed.data.phone);
  const phoneIdx = blindIndex(phone);

  const dupEmail = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (dupEmail) {
    return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 409 });
  }
  const dupPhone = await prisma.user.findUnique({
    where: { phoneBlindIndex: phoneIdx },
    select: { id: true },
  });
  if (dupPhone) {
    return NextResponse.json({ error: 'A user with this phone already exists.' }, { status: 409 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const phoneCiphertext = encryptField(phone, 'user:phone');

  try {
    const created = await prisma.user.create({
      data: {
        email: parsed.data.email,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        phone: phoneCiphertext as any,
        phoneBlindIndex: phoneIdx,
        passwordHash,
        firstName: parsed.data.firstName,
        middleName: parsed.data.middleName,
        lastName: parsed.data.lastName,
        displayName: `${parsed.data.firstName} ${parsed.data.lastName}`,
        country: parsed.data.country ?? 'NG',
        // Admin-created ⇒ email verified, phone trusted (admin is the verifier)
        emailVerified: true,
        phoneVerified: true,
        status: 'PENDING_KYC',
      },
      select: { id: true, email: true, firstName: true, lastName: true, status: true, createdAt: true },
    });

    await prisma.adminAuditLog.create({
      data: {
        adminId: session.userId,
        action: 'ADMIN_USER_CREATED',
        resourceType: 'User',
        resourceId: created.id,
        targetUserId: created.id,
        metadata: { email: created.email, createdBy: 'admin_panel' },
      },
    });

    logger.info(
      { adminId: session.userId, newUserId: created.id, email: created.email },
      'Admin created customer user',
    );

    return NextResponse.json(
      {
        user: {
          id: created.id,
          email: created.email,
          firstName: created.firstName,
          lastName: created.lastName,
          status: created.status,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ adminId: session.userId, err: msg }, 'Admin user creation failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
