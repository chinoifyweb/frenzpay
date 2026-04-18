/**
 * GET    /api/payment-links/[slug] — fetch a link's public details (no auth)
 *                                     Used by the public /pay/[slug] checkout
 * PATCH  /api/payment-links/[slug] — owner updates status (active/cancelled)
 * DELETE /api/payment-links/[slug] — owner cancels
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const link = await prisma.paymentLink.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, type: true, fixedAmountCents: true, minAmountCents: true,
      maxAmountCents: true, currency: true, description: true, status: true, expiresAt: true,
      user: {
        select: { firstName: true, lastName: true, frenzTag: { select: { tag: true, isVerified: true } } },
      },
    },
  });

  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  if (link.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'This link is no longer active.', status: link.status }, { status: 410 });
  }

  if (link.expiresAt && link.expiresAt < new Date()) {
    await prisma.paymentLink.update({ where: { slug }, data: { status: 'EXPIRED' } });
    return NextResponse.json({ error: 'This link has expired.' }, { status: 410 });
  }

  // Increment view count (fire-and-forget — we don't await failures)
  prisma.paymentLink.update({
    where: { slug },
    data: { viewCount: { increment: 1 } },
  }).catch(() => { /* ignore */ });

  const displayName = link.user.frenzTag?.tag
    ? `@${link.user.frenzTag.tag}`
    : `${link.user.firstName ?? ''} ${(link.user.lastName ?? '').charAt(0)}.`.trim();

  return NextResponse.json({
    slug: link.slug,
    type: link.type,
    fixedAmountMinor: link.fixedAmountCents?.toString() ?? null,
    minAmountMinor: link.minAmountCents?.toString() ?? null,
    maxAmountMinor: link.maxAmountCents?.toString() ?? null,
    currency: link.currency,
    description: link.description,
    recipient: {
      displayName,
      verified: link.user.frenzTag?.isVerified ?? false,
    },
  });
}

const PatchSchema = z.object({
  status: z.enum(['ACTIVE', 'CANCELLED']),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { session } = await requireSession();
  const { slug } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid status' }, { status: 422 });

  const link = await prisma.paymentLink.findUnique({
    where: { slug },
    select: { id: true, userId: true, status: true },
  });
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (link.userId !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await prisma.paymentLink.update({ where: { slug }, data: { status: parsed.data.status } });
  await prisma.auditLog.create({
    data: {
      userId: session.userId, action: `PAYMENT_LINK_${parsed.data.status}`,
      resourceType: 'PaymentLink', resourceId: link.id,
    },
  });

  return NextResponse.json({ ok: true, status: parsed.data.status });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { session } = await requireSession();
  const { slug } = await params;

  const link = await prisma.paymentLink.findUnique({
    where: { slug }, select: { id: true, userId: true },
  });
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (link.userId !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await prisma.paymentLink.update({ where: { slug }, data: { status: 'CANCELLED' } });
  return NextResponse.json({ ok: true });
}
