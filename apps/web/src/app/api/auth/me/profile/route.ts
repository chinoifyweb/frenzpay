/**
 * PATCH /api/auth/me/profile
 *
 * Update the authenticated user's display fields. Strict whitelist — auth,
 * KYC, status, balances, and any money-affecting column stays read-only.
 *
 * Fields:
 *   firstName    3-50 chars, letters / spaces / - / '
 *   lastName     same
 *   displayName  2-50 chars, letters + digits + spaces + basic punct
 *   avatarUrl    https URL on an allow-list host (no arbitrary image URLs)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';

const NAME_RE = /^[a-zA-Z][a-zA-Z\s\-'.]{1,49}$/;
const DISPLAY_RE = /^[a-zA-Z0-9][a-zA-Z0-9\s\-'._]{1,49}$/;

// Only accept avatar URLs on a few trusted hosts. Keeps arbitrary image URLs
// (tracking pixels, malware, etc.) out of the DB.
const AVATAR_HOST_ALLOWLIST = new Set([
  'cdn.frenzpay.co',
  'avatars.frenzpay.co',
]);

const Schema = z.object({
  firstName: z.string().regex(NAME_RE, 'Invalid first name').optional(),
  lastName: z.string().regex(NAME_RE, 'Invalid last name').optional(),
  displayName: z.string().regex(DISPLAY_RE, 'Invalid display name').optional(),
  avatarUrl: z
    .string()
    .url()
    .refine((u) => {
      try {
        const parsed = new URL(u);
        return parsed.protocol === 'https:' && AVATAR_HOST_ALLOWLIST.has(parsed.hostname);
      } catch {
        return false;
      }
    }, 'Avatar URL must be https and on an allowed host')
    .optional()
    .nullable(),
});

export async function PATCH(req: NextRequest) {
  const { session } = await requireSession();

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};
  if (parsed.data.firstName !== undefined) data.firstName = parsed.data.firstName.trim();
  if (parsed.data.lastName !== undefined) data.lastName = parsed.data.lastName.trim();
  if (parsed.data.displayName !== undefined) data.displayName = parsed.data.displayName.trim();
  if (parsed.data.avatarUrl !== undefined) data.avatarUrl = parsed.data.avatarUrl;

  // Auto-refresh derived displayName if first/last changed but displayName wasn't set
  if ((data.firstName || data.lastName) && !data.displayName) {
    const current = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { firstName: true, lastName: true },
    });
    const first = data.firstName ?? current?.firstName ?? '';
    const last = data.lastName ?? current?.lastName ?? '';
    const joined = `${first} ${last}`.trim();
    if (joined) data.displayName = joined;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 422 });
  }

  const updated = await prisma.user.update({
    where: { id: session.userId },
    data,
    select: {
      id: true, email: true, firstName: true, lastName: true, displayName: true,
      avatarUrl: true, kycTier: true, kycStatus: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'PROFILE_UPDATED',
      resourceType: 'User',
      resourceId: session.userId,
      metadata: { fields: Object.keys(data) },
    },
  });

  return NextResponse.json({ ok: true, user: updated });
}
