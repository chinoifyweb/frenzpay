/**
 * POST /api/auth/pin/setup  — set or change transaction PIN
 * POST /api/auth/pin/verify — verify PIN for step-up auth
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@frenzpay/db';
import { hashPin, verifyPin, verifyPassword } from '@frenzpay/auth';
import { requireSession } from '@/lib/session';

const SetupSchema = z.object({
  action: z.literal('setup'),
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
  confirmPin: z.string().regex(/^\d{6}$/),
  password: z.string().min(1, 'Current password required'), // require password to set PIN
});

const VerifySchema = z.object({
  action: z.literal('verify'),
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
});

const Schema = z.union([SetupSchema, VerifySchema]);

const PIN_LOCK_THRESHOLD = 5; // lock after 5 consecutive failures
const PIN_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: NextRequest) {
  const { session } = await requireSession();
  const userId = session.userId;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 422 });
  }

  // ── Setup ─────────────────────────────────────────────────────────────────

  if (parsed.data.action === 'setup') {
    const { pin, confirmPin, password } = parsed.data;

    if (pin !== confirmPin) {
      return NextResponse.json({ error: 'PINs do not match' }, { status: 422 });
    }

    // Verify current password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 403 });
    }

    const pinHash = await hashPin(pin);

    await prisma.transactionPin.upsert({
      where: { userId },
      create: { userId, pinHash },
      update: { pinHash, failedAttempts: 0, lockedUntil: null },
    });

    return NextResponse.json({ success: true, message: 'Transaction PIN set.' });
  }

  // ── Verify ────────────────────────────────────────────────────────────────

  const { pin } = parsed.data;

  const pinRecord = await prisma.transactionPin.findUnique({ where: { userId } });

  if (!pinRecord) {
    return NextResponse.json({ error: 'No PIN set. Please set a PIN first.' }, { status: 400 });
  }

  // Check lock
  if (pinRecord.lockedUntil && pinRecord.lockedUntil > new Date()) {
    const waitMs = pinRecord.lockedUntil.getTime() - Date.now();
    const waitMin = Math.ceil(waitMs / 60_000);
    return NextResponse.json(
      { error: `PIN locked. Try again in ${waitMin} minute(s).` },
      { status: 403 },
    );
  }

  const valid = await verifyPin(pin, pinRecord.pinHash);

  if (!valid) {
    const newFailed = pinRecord.failedAttempts + 1;
    const lockedUntil =
      newFailed >= PIN_LOCK_THRESHOLD
        ? new Date(Date.now() + PIN_LOCK_DURATION_MS)
        : null;

    await prisma.transactionPin.update({
      where: { userId },
      data: { failedAttempts: newFailed, lockedUntil },
    });

    return NextResponse.json(
      {
        error: 'Incorrect PIN.',
        attemptsRemaining: Math.max(0, PIN_LOCK_THRESHOLD - newFailed),
      },
      { status: 403 },
    );
  }

  // Reset failed attempts on success
  await prisma.transactionPin.update({
    where: { userId },
    data: { failedAttempts: 0, lockedUntil: null },
  });

  return NextResponse.json({ valid: true });
}
