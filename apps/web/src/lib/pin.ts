/**
 * Shared PIN verification helper — used by both the PIN route and transaction
 * endpoints (P2P send, withdrawals) for step-up auth on money movement.
 *
 * Enforces a 5-failure lockout window of 15 minutes.
 */
import { prisma } from '@frenzpay/db';
import { verifyPin } from '@frenzpay/auth';

const PIN_LOCK_THRESHOLD = 5;
const PIN_LOCK_DURATION_MS = 15 * 60 * 1000;

export type PinVerifyResult =
  | { ok: true }
  | { ok: false; status: 400 | 403; error: string; attemptsRemaining?: number };

/**
 * Verify a user's transaction PIN.
 * Tracks failures and locks the PIN after 5 consecutive wrong attempts.
 */
export async function verifyUserPin(userId: string, pin: string): Promise<PinVerifyResult> {
  if (!/^\d{6}$/.test(pin)) {
    return { ok: false, status: 400, error: 'PIN must be exactly 6 digits.' };
  }

  const record = await prisma.transactionPin.findUnique({ where: { userId } });

  if (!record) {
    return { ok: false, status: 400, error: 'No transaction PIN set. Set one in Settings first.' };
  }

  if (record.lockedUntil && record.lockedUntil > new Date()) {
    const waitMin = Math.ceil((record.lockedUntil.getTime() - Date.now()) / 60_000);
    return { ok: false, status: 403, error: `PIN locked. Try again in ${waitMin} minute(s).` };
  }

  const valid = await verifyPin(pin, record.pinHash);

  if (!valid) {
    const newFailed = record.failedAttempts + 1;
    const lockedUntil =
      newFailed >= PIN_LOCK_THRESHOLD ? new Date(Date.now() + PIN_LOCK_DURATION_MS) : null;

    await prisma.transactionPin.update({
      where: { userId },
      data: { failedAttempts: newFailed, lockedUntil },
    });

    return {
      ok: false,
      status: 403,
      error: 'Incorrect PIN.',
      attemptsRemaining: Math.max(0, PIN_LOCK_THRESHOLD - newFailed),
    };
  }

  // Success — reset counter
  await prisma.transactionPin.update({
    where: { userId },
    data: { failedAttempts: 0, lockedUntil: null },
  });

  return { ok: true };
}
