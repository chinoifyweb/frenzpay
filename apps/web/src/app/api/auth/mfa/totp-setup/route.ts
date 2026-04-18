/**
 * POST /api/auth/mfa/totp-setup
 *
 * Generates a TOTP secret and QR code URI for enrollment.
 * Does NOT activate MFA yet — the client must call totp-verify with a valid
 * token to confirm they scanned the QR correctly.
 *
 * Stores the pending secret in Redis (key: totp_pending:{userId}) for 10 min.
 * Requires an authenticated session.
 */

import { NextResponse } from 'next/server';
import { generateTotpSecret } from '@frenzpay/auth/totp';
import { encryptField } from '@frenzpay/crypto';
import { requireSession } from '@/lib/session';
import { redis } from '@/lib/redis';

export async function POST() {
  const { session } = await requireSession();
  const userId = session.userId;

  const { secret, uri } = generateTotpSecret(session.email);

  // Store encrypted secret in Redis pending confirmation
  const encrypted = encryptField(secret, `totp:${userId}`);
  await redis.set(
    `totp_pending:${userId}`,
    JSON.stringify({ encrypted, secret }), // secret kept in redis only for the setup window
    'EX',
    600, // 10 minutes
  );

  return NextResponse.json({
    uri,
    // Don't return raw secret — only URI for QR code display
    // secret is kept server-side until confirmed
  });
}
