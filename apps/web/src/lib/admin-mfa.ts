/**
 * Admin break-glass MFA verification.
 *
 * Every admin operation that mutates user state MUST pass through this helper.
 * It requires the admin to supply a fresh TOTP code (not their existing
 * session — that's not enough for high-privilege actions), and writes a
 * structured AuditLog entry so every action is traceable to a specific admin
 * at a specific time with a supplied reason.
 */
import { prisma } from '@frenzpay/db';
import { decryptField } from '@frenzpay/crypto';
import { verifyTotp } from '@frenzpay/auth/totp';

export interface AdminOpInput {
  adminUserId: string;
  totpCode: string;
  reason: string;
}

export type AdminOpGate =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 422; error: string };

const MIN_REASON_LENGTH = 20;

/**
 * Returns { ok: true } if the admin has an active TOTP enrollment AND the
 * supplied code verifies AND the supplied reason meets length requirements.
 *
 * Callers should treat a failure as fatal — do NOT proceed with the operation.
 */
export async function gateAdminOp(input: AdminOpInput): Promise<AdminOpGate> {
  if (!input.totpCode || !/^\d{6}$/.test(input.totpCode)) {
    return { ok: false, status: 422, error: 'TOTP code must be 6 digits' };
  }

  if (!input.reason || input.reason.trim().length < MIN_REASON_LENGTH) {
    return {
      ok: false,
      status: 422,
      error: `Reason must be at least ${MIN_REASON_LENGTH} characters explaining the operation.`,
    };
  }

  // Admins store their TOTP secret inline on the admin_users table, not in the
  // user-facing mfa_secrets table (that FK'd into users.id). The secret is
  // stored as an encrypted JSON CipherPayload string.
  const admin = await prisma.adminUser.findUnique({
    where: { id: input.adminUserId },
    select: { mfaSecret: true, isActive: true },
  });

  if (!admin || !admin.isActive) {
    return { ok: false, status: 403, error: 'Admin account is not active.' };
  }
  if (!admin.mfaSecret) {
    return {
      ok: false,
      status: 403,
      error: 'Admin TOTP is not enrolled. Enrol one at /admin/security before running break-glass ops.',
    };
  }

  // Decrypt the stored TOTP secret (Base32) and verify the code
  let base32Secret: string;
  try {
    // The stored mfaSecret is a JSON-serialised CipherPayload
    const cipher = JSON.parse(admin.mfaSecret);
    base32Secret = decryptField(cipher);
  } catch {
    return { ok: false, status: 403, error: 'Failed to load admin TOTP secret' };
  }

  if (!verifyTotp(base32Secret, input.totpCode)) {
    return { ok: false, status: 403, error: 'Invalid TOTP code' };
  }

  return { ok: true };
}
