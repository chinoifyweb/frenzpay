/**
 * GET  /api/frenz-tag?tag=xxx  -- check availability
 * POST /api/frenz-tag           -- claim a FrenzTag (T0 user, no existing tag)
 * PATCH /api/frenz-tag          -- change FrenzTag (T1+ user, once per year)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { validateFrenzTag, FRENZ_TAG_QUARANTINE_DAYS } from '@frenzpay/kyc';

// GET: availability check (no auth required)
export async function GET(req: NextRequest) {
  const tag = req.nextUrl.searchParams.get('tag')?.toLowerCase().trim();

  if (!tag) {
    return NextResponse.json({ error: 'tag query param is required' }, { status: 400 });
  }

  const validation = validateFrenzTag(tag);
  if (!validation.valid) {
    return NextResponse.json({ available: false, error: validation.error });
  }

  const now = new Date();

  const existing = await prisma.frenzTag.findUnique({ where: { tag } });
  if (existing) {
    return NextResponse.json({ available: false, reason: 'taken' });
  }

  const quarantined = await prisma.frenzTagReservation.findFirst({
    where: { oldTag: tag, quarantineUntil: { gt: now } },
  });
  if (quarantined) {
    return NextResponse.json({
      available: false,
      reason: 'quarantined',
      availableAfter: quarantined.quarantineUntil.toISOString(),
    });
  }

  return NextResponse.json({ available: true });
}

// POST: claim FrenzTag
const ClaimSchema = z.object({
  tag: z.string().min(6).max(8),
});

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ClaimSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const tag = parsed.data.tag.toLowerCase().trim();
  const validation = validateFrenzTag(tag);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 422 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { frenzTag: { select: { id: true, tag: true } } },
  });

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.frenzTag) {
    return NextResponse.json({ error: 'You already have a FrenzTag. Use PATCH to change it.' }, { status: 409 });
  }

  const now = new Date();
  const quarantined = await prisma.frenzTagReservation.findFirst({
    where: { oldTag: tag, quarantineUntil: { gt: now } },
  });
  if (quarantined) {
    return NextResponse.json({ error: 'This FrenzTag is in quarantine.' }, { status: 409 });
  }

  try {
    const frenzTag = await prisma.$transaction(async (tx: any) => {
      const ft = await tx.frenzTag.create({
        data: { userId: session.userId, tag },
      });

      // NB: Claiming a FrenzTag is purely a handle reservation. It MUST NOT
      // advance KYC tier, set status=ACTIVE, or change kycStatus — that
      // would let any T0 user skip BVN/NIN verification just by picking a
      // username. Promotion to T1 only happens via /api/kyc/t1 after a
      // successful Dojah verification (or admin override).

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'FRENZ_TAG_CLAIMED',
          resourceType: 'FrenzTag',
          resourceId: ft.id,
          metadata: { tag },
        },
      });

      return ft;
    });

    return NextResponse.json({ tag: frenzTag.tag, claimedAt: frenzTag.claimedAt }, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'That FrenzTag was just taken. Please try another.' }, { status: 409 });
    }
    throw err;
  }
}

// PATCH: change FrenzTag
export async function PATCH(req: NextRequest) {
  const { session } = await requireSession();

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ClaimSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const newTag = parsed.data.tag.toLowerCase().trim();
  const validation = validateFrenzTag(newTag);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 422 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      kycTier: true,
      frenzTag: {
        include: { reservations: { orderBy: { createdAt: 'desc' }, take: 1 } },
      },
    },
  });

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (user.kycTier === 'T0') {
    return NextResponse.json({ error: 'Claim a FrenzTag first before changing it.' }, { status: 403 });
  }

  if (!user.frenzTag) {
    return NextResponse.json({ error: 'No FrenzTag found. Use POST to claim one.' }, { status: 404 });
  }

  if (user.frenzTag.tag === newTag) {
    return NextResponse.json({ error: 'New tag must be different from your current tag.' }, { status: 422 });
  }

  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  if (user.frenzTag.lastChangedAt && user.frenzTag.lastChangedAt > oneYearAgo) {
    const nextAllowed = new Date(user.frenzTag.lastChangedAt.getTime() + 365 * 24 * 60 * 60 * 1000);
    return NextResponse.json({
      error: 'FrenzTag can only be changed once per year. Next change: ' + nextAllowed.toDateString() + '.',
      nextAllowedAt: nextAllowed.toISOString(),
    }, { status: 429 });
  }

  const now = new Date();
  const quarantined = await prisma.frenzTagReservation.findFirst({
    where: { oldTag: newTag, quarantineUntil: { gt: now } },
  });
  if (quarantined) {
    return NextResponse.json({ error: 'This FrenzTag is in quarantine.' }, { status: 409 });
  }

  const existing = await prisma.frenzTag.findUnique({ where: { tag: newTag } });
  if (existing) {
    return NextResponse.json({ error: 'This FrenzTag is already taken.' }, { status: 409 });
  }

  try {
    const oldTag = user.frenzTag.tag;
    const quarantineUntil = new Date(Date.now() + FRENZ_TAG_QUARANTINE_DAYS * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx: any) => {
      await tx.frenzTagReservation.create({
        data: { frenzTagId: user.frenzTag!.id, oldTag, quarantineUntil },
      });
      await tx.frenzTag.update({
        where: { id: user.frenzTag!.id },
        data: { tag: newTag, lastChangedAt: now },
      });
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'FRENZ_TAG_CHANGED',
          resourceType: 'FrenzTag',
          resourceId: user.frenzTag!.id,
          metadata: { oldTag, newTag, quarantineUntil: quarantineUntil.toISOString() },
        },
      });
    });

    return NextResponse.json({ tag: newTag, oldTag, quarantineUntil: quarantineUntil.toISOString() });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'That FrenzTag was just taken. Please try another.' }, { status: 409 });
    }
    throw err;
  }
}
