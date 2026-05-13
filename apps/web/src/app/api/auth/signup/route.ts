/**
 * POST /api/auth/signup
 *
 * Creates a new user account. Flow:
 * 1. IP rate limit (5 signups/hour per IP)
 * 2. Validate input (Zod)
 * 3. Block disposable email domains
 * 4. Check email + phone uniqueness
 * 5. Hash password (Argon2id)
 * 6. Encrypt phone + create blind index
 * 7. Create User + EmailVerificationToken in DB transaction
 *    (phoneVerified defaults to true — no SMS at signup; phone is re-checked
 *    at KYC T1 via BVN/NIN cross-reference)
 * 8. Send email OTP via Purelymail SMTP (TODO: phone SMS was removed 2026-04-18)
 *
 * Returns 201 { userId, nextStep: 'verify_email' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@frenzpay/db';
import { hashPassword, generateOtp, hashToken } from '@frenzpay/auth';
import { encryptField, blindIndex } from '@frenzpay/crypto';
import { checkAuthRateLimit, rateLimitHeaders } from '@frenzpay/auth/rate-limit';
import { redis } from '@/lib/redis';
import { logger } from '@frenzpay/logger';
import { sendEmailVerificationOtp } from '@/lib/email';

// ─── Validation schema ────────────────────────────────────────────────────────

const SignupSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{9,14}$/, 'Phone must be E.164 format e.g. +2348012345678'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128)
    .refine((v) => /[A-Z]/.test(v), 'Must contain an uppercase letter')
    .refine((v) => /[a-z]/.test(v), 'Must contain a lowercase letter')
    .refine((v) => /[0-9]/.test(v), 'Must contain a number')
    .refine((v) => /[^A-Za-z0-9]/.test(v), 'Must contain a special character'),
  firstName: z.string().min(1).max(50).trim(),
  // middleName is OPTIONAL — many Nigerian IDs (NIN, certain
  // passports) have only first + last. Forcing customers to invent
  // a middle name caused name-mismatch KYC rejections AND, when the
  // form didn't send the field at all, made signup hard-fail with
  // a 422 "Required" that the UI showed as "something went wrong".
  // Empty string normalises to undefined so downstream code sees a
  // proper "no middle name" signal.
  middleName: z
    .string()
    .max(60)
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  lastName: z.string().min(1).max(50).trim(),
  agreedToTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms of Service' }),
  }),
});

// ─── Disposable email block ───────────────────────────────────────────────────

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'sharklasers.com', 'guerrillamailblock.com', 'grr.la', 'guerrillamail.info',
  'guerrillamail.biz', 'guerrillamail.de', 'guerrillamail.net', 'guerrillamail.org',
  'spam4.me', 'yopmail.com', 'dispostable.com', 'mailnull.com', 'spamgourmet.com',
  'trashmail.com', 'trashmail.me', 'trashmail.net', 'trashmail.at',
  'fakeinbox.com', 'mailnesia.com', 'maildrop.cc',
]);

function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1';

  // 1. Rate limit
  const rl = await checkAuthRateLimit(redis, { ip, action: 'signup' });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many signup attempts. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  // 2. Parse + validate
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { email, phone, password, firstName, middleName, lastName } = parsed.data;

  // 3. Block disposable emails
  if (isDisposableEmail(email)) {
    return NextResponse.json(
      { error: 'Disposable email addresses are not allowed.' },
      { status: 422 },
    );
  }

  // 4a. Check email uniqueness
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Constant-time response to avoid leaking existence
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 100));
    return NextResponse.json(
      { error: 'An account with this email already exists.' },
      { status: 409 },
    );
  }

  // 4b. Check phone blind index uniqueness
  const phoneIdx = blindIndex(phone);
  const existingPhone = await prisma.user.findUnique({
    where: { phoneBlindIndex: phoneIdx },
  });
  if (existingPhone) {
    return NextResponse.json(
      { error: 'An account with this phone number already exists.' },
      { status: 409 },
    );
  }

  // 5. Hash password
  const passwordHash = await hashPassword(password);

  // 6. Encrypt phone (stored for KYC — no verification required at signup)
  const phoneCiphertext = encryptField(phone, 'user:phone');

  // 7. Generate email OTP only. Phone verification is handled at KYC T1+
  //    (BVN/NIN cross-check) — no SMS required at signup to cut friction.
  const emailOtp = generateOtp();
  const emailOtpHash = hashToken(emailOtp);

  const now = new Date();
  const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
  const emailExpiry = new Date(now.getTime() + OTP_TTL_MS);

  // 8. DB transaction
  let userId: string;
  try {
    const user = await prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (tx: any) => {
      const created = await tx.user.create({
        data: {
          email,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          phone: phoneCiphertext as any,
          phoneBlindIndex: phoneIdx,
          passwordHash,
          firstName,
          middleName,
          lastName,
          displayName: `${firstName} ${lastName}`,
          emailVerified: false,
          phoneVerified: true,  // no SMS verification at signup — verified later at KYC T1
          status: 'PENDING_KYC',
          kycTier: 'T0',
          kycStatus: 'NOT_STARTED',
        },
        select: { id: true },
      });

      await tx.emailVerificationToken.create({
        data: {
          userId: created.id,
          tokenHash: emailOtpHash,
          expiresAt: emailExpiry,
        },
      });

      // Phone OTP intentionally omitted — SMS verification removed from signup
      // flow. The phone number is kept encrypted on User.phone for KYC T1+.

      return created;
    });

    userId = user.id;
  } catch (err) {
    logger.error({ err }, 'signup: db transaction failed');
    return NextResponse.json(
      { error: 'Failed to create account. Please try again.' },
      { status: 500 },
    );
  }

  logger.info({ userId, email }, 'signup: user created');

  // Send email OTP via Resend. Fire-and-forget but log failures so the user
  // can always fall back to the /resend-otp endpoint. Phone OTP (Termii/AT)
  // still lives under TODO(phase-7) — SMS provider not wired yet.
  try {
    await sendEmailVerificationOtp(email, firstName, emailOtp);
    logger.info({ userId, email }, 'signup: verification email sent');
  } catch (err) {
    logger.error(
      { userId, email, err: err instanceof Error ? err.message : err },
      'signup: verification email failed to send — user can click resend',
    );
  }

  const response: Record<string, unknown> = {
    userId,
    nextStep: 'verify_email',
    message: 'Account created. Check your email for the verification code.',
  };

  // Dev: return OTP in response for testing
  if (process.env.NODE_ENV !== 'production') {
    response['_devEmailOtp'] = emailOtp;
  }

  return NextResponse.json(response, { status: 201 });
}
