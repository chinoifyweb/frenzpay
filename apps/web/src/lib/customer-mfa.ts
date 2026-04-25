/**
 * Customer-MFA gate for sensitive operations.
 *
 * Money-moving customer endpoints (withdrawal today, sends/conversions
 * later) require a fresh 6-digit code from the customer's authenticator
 * app. Email OTP is not acceptable here — it would be a way for a
 * compromised email account to drain the wallet. The customer must have
 * Google Authenticator (or any TOTP app) enrolled, and supply the code
 * inside the request.
 *
 * Usage from a route handler:
 *
 *   const gate = await requireCustomerTotp(req, session.userId);
 *   if (!gate.ok) return gate.response;
 *   // proceed with the money-moving op
 *
 * The code can be supplied in either:
 *   - Header   `X-Mfa-Token: 123456`     (preferred — keeps it out of bodies)
 *   - JSON body  `{ ..., totpCode: '123456' }` (back-compat for forms)
 *
 * On success the helper returns the matched MfaSecret id so the route
 * can write it into audit metadata if desired.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@frenzpay/db';
import { verifyTotp } from '@frenzpay/auth/totp';
import { decryptField, type CipherPayload } from '@frenzpay/crypto';
import { logger } from '@frenzpay/logger';

export type CustomerTotpResult =
  | { ok: true; mfaSecretId: string }
  | { ok: false; response: NextResponse };

const TokenSchema = z.string().regex(/^\d{6}$/);

/**
 * Pulls a TOTP code from the request, verifies it against the
 * customer's enrolled authenticator, and returns either ok:true or a
 * pre-built NextResponse the caller can return directly.
 *
 * Important: this function MAY consume the request body (when the code
 * isn't in a header). Pass `bodyClone` if you've already parsed the
 * body upstream.
 */
export async function requireCustomerTotp(
  req: Request,
  userId: string,
  bodyClone?: { totpCode?: string },
): Promise<CustomerTotpResult> {
  // Pull the code — header first, then body fallback.
  let code: string | null = req.headers.get('x-mfa-token') ?? req.headers.get('X-Mfa-Token');
  if (!code && bodyClone) {
    code = typeof bodyClone.totpCode === 'string' ? bodyClone.totpCode : null;
  }

  if (!code) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Two-factor authentication is required for this action.',
          // Tells the UI which step to render. The dashboard withdraw
          // page reads this and shows the TOTP input step.
          mfaRequired: 'totp',
          // Helpful hint when the customer hasn't enrolled yet.
          enrollUrl: '/dashboard/security',
        },
        { status: 401 },
      ),
    };
  }

  const parsed = TokenSchema.safeParse(code);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Authenticator code must be exactly 6 digits.' },
        { status: 422 },
      ),
    };
  }

  // Find the active TOTP secret. There's at most one because totp-verify
  // (mode: 'setup') deactivates older entries when a new one is committed.
  const secret = await prisma.mfaSecret.findFirst({
    where: { userId, type: 'totp', isActive: true },
    select: { id: true, secret: true },
  });

  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'You need to set up Google Authenticator before you can do this. Open Security in your dashboard to enrol.',
          mfaRequired: 'totp',
          enrollRequired: true,
          enrollUrl: '/dashboard/security',
        },
        { status: 403 },
      ),
    };
  }

  let plaintextSecret: string;
  try {
    const payload = JSON.parse(secret.secret) as CipherPayload;
    plaintextSecret = decryptField(payload, `totp:${userId}`);
  } catch (err) {
    logger.error(
      { userId, err: err instanceof Error ? err.message : err },
      'TOTP secret decrypt failed during requireCustomerTotp',
    );
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Could not verify your authenticator code. Contact support.' },
        { status: 500 },
      ),
    };
  }

  if (!verifyTotp(plaintextSecret, parsed.data)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Wrong authenticator code. Try again with the current 6-digit code.',
          mfaRequired: 'totp',
        },
        { status: 401 },
      ),
    };
  }

  return { ok: true, mfaSecretId: secret.id };
}
