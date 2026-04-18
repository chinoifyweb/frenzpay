/**
 * GET  /api/payment-links — list the authenticated user's payment links
 * POST /api/payment-links — create a new payment link (T1+ required)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { randomBytes } from 'node:crypto';

const CreateSchema = z.object({
  type: z.enum(['fixed', 'open']),
  fixedAmountMinor: z.string().regex(/^[1-9][0-9]*$/).optional(),
  minAmountMinor: z.string().regex(/^[1-9][0-9]*$/).optional(),
  maxAmountMinor: z.string().regex(/^[1-9][0-9]*$/).optional(),
  currency: z.enum(['USD', 'NGN', 'USDC']).default('USD'),
  description: z.string().min(1).max(200),
  expiresAt: z.string().datetime().optional(),
});

function generateSlug(): string {
  // URL-safe, 10 chars — collision probability ~1 in 10^18 per user
  return randomBytes(6).toString('base64url').slice(0, 10);
}

export async function GET() {
  const { session } = await requireSession();

  const links = await prisma.paymentLink.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, slug: true, type: true, fixedAmountCents: true, minAmountCents: true,
      maxAmountCents: true, currency: true, description: true, status: true,
      expiresAt: true, viewCount: true, createdAt: true,
    },
  });

  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    links: links.map((l: any) => ({
      ...l,
      fixedAmountCents: l.fixedAmountCents?.toString() ?? null,
      minAmountCents: l.minAmountCents?.toString() ?? null,
      maxAmountCents: l.maxAmountCents?.toString() ?? null,
      expiresAt: l.expiresAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { kycTier: true, status: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Account not active.' }, { status: 403 });
  }
  if (user.kycTier === 'T0') {
    return NextResponse.json({ error: 'Complete KYC to create payment links.' }, { status: 403 });
  }

  if (parsed.data.type === 'fixed' && !parsed.data.fixedAmountMinor) {
    return NextResponse.json({ error: 'Fixed links require fixedAmountMinor.' }, { status: 422 });
  }

  // Generate unique slug (retry on rare collision)
  let slug = generateSlug();
  for (let i = 0; i < 5; i++) {
    const existing = await prisma.paymentLink.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) break;
    slug = generateSlug();
  }

  const link = await prisma.paymentLink.create({
    data: {
      userId: session.userId,
      slug,
      type: parsed.data.type,
      fixedAmountCents: parsed.data.fixedAmountMinor ? BigInt(parsed.data.fixedAmountMinor) : null,
      minAmountCents: parsed.data.minAmountMinor ? BigInt(parsed.data.minAmountMinor) : null,
      maxAmountCents: parsed.data.maxAmountMinor ? BigInt(parsed.data.maxAmountMinor) : null,
      currency: parsed.data.currency,
      description: parsed.data.description,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      status: 'ACTIVE',
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId, action: 'PAYMENT_LINK_CREATED',
      resourceType: 'PaymentLink', resourceId: link.id,
      metadata: { slug, type: parsed.data.type, currency: parsed.data.currency },
    },
  });

  return NextResponse.json({
    link: {
      id: link.id, slug: link.slug, type: link.type,
      url: `/pay/${link.slug}`, status: link.status,
    },
  }, { status: 201 });
}
