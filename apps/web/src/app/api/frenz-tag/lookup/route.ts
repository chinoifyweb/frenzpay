/**
 * GET /api/frenz-tag/lookup?tag=xxx
 * Looks up a recipient by FrenzTag and returns the minimum info needed for the
 * sender to confirm before transferring money:
 *   - FrenzTag
 *   - Display name (first name + last initial, e.g. "Jane D.")
 *   - Verified badge (true if the FrenzTag has been verified)
 *
 * Does NOT leak: email, phone, full last name, user ID, balance, tier, DOB.
 *
 * Requires auth so that enumeration attacks are at least tied to an account.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { validateFrenzTag } from '@frenzpay/kyc';

export async function GET(req: NextRequest) {
  const { session } = await requireSession();
  const tag = req.nextUrl.searchParams.get('tag')?.toLowerCase().trim();

  if (!tag) {
    return NextResponse.json({ error: 'tag query param is required' }, { status: 400 });
  }

  const validation = validateFrenzTag(tag);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 422 });
  }

  const frenzTag = await prisma.frenzTag.findUnique({
    where: { tag },
    select: {
      tag: true,
      isVerified: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      },
    },
  });

  if (!frenzTag) {
    return NextResponse.json({ found: false }, { status: 404 });
  }

  // Block sends to self
  if (frenzTag.user.id === session.userId) {
    return NextResponse.json(
      { found: true, self: true, error: 'You cannot send money to yourself.' },
      { status: 409 },
    );
  }

  // Block sends to inactive accounts
  if (frenzTag.user.status !== 'ACTIVE') {
    return NextResponse.json(
      { found: false, reason: 'recipient_unavailable' },
      { status: 410 },
    );
  }

  const first = frenzTag.user.firstName ?? '';
  const last = frenzTag.user.lastName ?? '';
  const displayName = last
    ? `${first} ${last.charAt(0)}.`
    : (first || frenzTag.tag);

  return NextResponse.json({
    found: true,
    tag: frenzTag.tag,
    isVerified: frenzTag.isVerified,
    displayName: displayName.trim(),
  });
}
