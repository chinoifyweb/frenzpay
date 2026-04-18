/**
 * POST /api/payment-links/public/[slug]/charge
 * Public endpoint — no auth required. Anyone with the link URL can hit this to
 * initialize a Paystack checkout. Returns an `authorizationUrl` the client
 * redirects to, and a `reference` used by the webhook to credit the creator.
 *
 * Body: { amountMinor: string, email: string }
 *
 * NB: The actual fund crediting happens server-side in
 * /api/webhooks/paystack-charge on `charge.success`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@frenzpay/db';
import { checkRateLimit } from '@frenzpay/auth/rate-limit';
import { redis } from '@/lib/redis';
import { randomBytes } from 'node:crypto';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  amountMinor: z.string().regex(/^[1-9][0-9]*$/),
  email: z.string().email().max(254),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown';

  // Rate limit: 5 checkout inits per minute per IP
  const rl = await checkRateLimit(redis, `rl:pay:charge:ip:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

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

  const link = await prisma.paymentLink.findUnique({
    where: { slug },
    select: {
      id: true, userId: true, type: true, fixedAmountCents: true, minAmountCents: true,
      maxAmountCents: true, currency: true, description: true, status: true, expiresAt: true,
    },
  });

  if (!link || link.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Link is not active.' }, { status: 410 });
  }
  if (link.expiresAt && link.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Link has expired.' }, { status: 410 });
  }

  const requestedAmount = BigInt(parsed.data.amountMinor);

  // Validate amount per link type
  if (link.type === 'fixed') {
    if (link.fixedAmountCents && requestedAmount !== link.fixedAmountCents) {
      return NextResponse.json({ error: 'Amount does not match the fixed link amount.' }, { status: 422 });
    }
  } else if (link.type === 'open') {
    if (link.minAmountCents && requestedAmount < link.minAmountCents) {
      return NextResponse.json({ error: `Minimum amount is ${link.minAmountCents}.` }, { status: 422 });
    }
    if (link.maxAmountCents && requestedAmount > link.maxAmountCents) {
      return NextResponse.json({ error: `Maximum amount is ${link.maxAmountCents}.` }, { status: 422 });
    }
  }

  // Generate a reference we'll recognize in the webhook
  const reference = `frenz-pl-${link.id.slice(0, 8)}-${randomBytes(6).toString('hex')}`;

  // Initialize a Paystack transaction (inline checkout)
  // NB: Paystack amounts are in kobo for NGN / cents for USD — same as our minor units.
  const paystackSecret = process.env['PAYSTACK_SECRET_KEY'];
  if (!paystackSecret) {
    // Dev mode: return a stub authorization URL so the UI flow still works
    logger.warn({ slug }, 'PAYSTACK_SECRET_KEY missing — returning stub authorization URL');
    await prisma.$transaction(async (tx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = tx as any;
      // Store pending charge in metadata so the webhook stub can find it
      await t.paymentLink.update({
        where: { id: link.id },
        data: { viewCount: { increment: 1 } },
      });
    });
    return NextResponse.json({
      authorizationUrl: `/pay/${slug}/mock-success?reference=${reference}`,
      reference,
      stub: true,
    });
  }

  const base = process.env['PAYSTACK_API_BASE'] ?? 'https://api.paystack.co';
  const initRes = await fetch(`${base}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${paystackSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: parsed.data.email,
      amount: Number(requestedAmount),
      currency: link.currency,
      reference,
      metadata: {
        paymentLinkId: link.id,
        paymentLinkSlug: slug,
        recipientUserId: link.userId,
      },
      callback_url: `${process.env['NEXT_PUBLIC_APP_URL'] ?? ''}/pay/${slug}/success`,
    }),
  });

  const initJson = await initRes.json();
  if (!initRes.ok || !initJson.status) {
    return NextResponse.json(
      { error: initJson.message ?? 'Payment initialization failed' },
      { status: 502 },
    );
  }

  return NextResponse.json({
    authorizationUrl: initJson.data.authorization_url,
    accessCode: initJson.data.access_code,
    reference,
  });
}
