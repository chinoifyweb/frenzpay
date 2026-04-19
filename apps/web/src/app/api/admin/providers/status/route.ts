/**
 * GET /api/admin/providers/status
 *
 * Returns the configuration status of every external provider the app talks
 * to — Paystack, Bridge, Dojah, Sentry — without ever returning the raw keys.
 *
 * Values shown to the admin:
 *   - `configured`: whether the env var is set (non-empty)
 *   - `tail`: last 4 chars of the key (or null) — useful to confirm rotation
 *             landed without exposing the full secret
 *
 * The raw values are never serialised — see `maskTail` below, which truncates
 * before it ever leaves the request handler.
 */

import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';

interface KeyInfo {
  name: string;
  /** One-line description of what this key unlocks */
  description: string;
  /** Whether the env var is set + non-empty */
  configured: boolean;
  /** Last 4 chars of the key, for "did my rotation land?" confirmation */
  tail: string | null;
  /** Reserved for provider-specific key-mode hints (e.g. sk_live vs sk_test). */
  mode: 'live' | 'test' | 'unknown' | null;
}

interface ProviderStatus {
  id: 'bridge' | 'dojah' | 'sentry';
  name: string;
  purpose: string;
  /** Where the admin should go to get / rotate these keys */
  dashboardUrl: string;
  keys: KeyInfo[];
  /** Aggregate status: 'ok' if all required keys set, 'partial' if some, 'missing' if none */
  status: 'ok' | 'partial' | 'missing';
  /** Which app features are impacted when this provider isn't configured */
  blocks: string[];
  /** Whether a network test is available (not all providers have a cheap read endpoint) */
  testable: boolean;
}

/**
 * Return only the last 4 characters of a key, or null. Never logs. Never
 * returns the full string. If the key is shorter than 8 chars, returns null
 * to avoid leaking the entire secret for trivially-short dev values.
 */
function maskTail(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length < 8) return null;
  return value.slice(-4);
}

export async function GET() {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const bridgeKey = process.env['BRIDGE_API_KEY'];
  const bridgeWebhook = process.env['BRIDGE_WEBHOOK_SECRET'];
  const dojahAppId = process.env['DOJAH_APP_ID'];
  const dojahKey = process.env['DOJAH_PRIVATE_KEY'];
  const sentryDsn = process.env['SENTRY_DSN'];

  const providers: ProviderStatus[] = [
    {
      id: 'bridge',
      name: 'Bridge',
      purpose: 'USD virtual accounts + USDC custody + virtual cards',
      dashboardUrl: 'https://dashboard.bridge.xyz',
      status: bridgeKey && bridgeWebhook ? 'ok' : bridgeKey || bridgeWebhook ? 'partial' : 'missing',
      blocks: [
        'USD virtual account provisioning',
        'USDC deposits and custody',
        'Virtual Mastercard / Visa issuance',
      ],
      testable: !!bridgeKey,
      keys: [
        {
          name: 'BRIDGE_API_KEY',
          description: 'Server-side API key from the Bridge dashboard',
          configured: !!bridgeKey,
          tail: maskTail(bridgeKey),
          mode: null,
        },
        {
          name: 'BRIDGE_WEBHOOK_SECRET',
          description: 'HMAC-SHA256 shared secret used to verify Bridge webhooks',
          configured: !!bridgeWebhook,
          tail: maskTail(bridgeWebhook),
          mode: null,
        },
      ],
    },
    {
      id: 'dojah',
      name: 'Dojah',
      purpose: 'Identity verification (BVN, NIN, selfie liveness)',
      dashboardUrl: 'https://app.dojah.io',
      status: dojahAppId && dojahKey ? 'ok' : dojahAppId || dojahKey ? 'partial' : 'missing',
      blocks: [
        'KYC T1 — BVN / NIN name match',
        'KYC T2 — selfie liveness',
      ],
      testable: false, // Dojah charges per call; don't burn quota on "is it alive?" checks
      keys: [
        {
          name: 'DOJAH_APP_ID',
          description: 'App ID from the Dojah console',
          configured: !!dojahAppId,
          tail: maskTail(dojahAppId),
          mode: null,
        },
        {
          name: 'DOJAH_PRIVATE_KEY',
          description: 'Private / secret key — never exposed to client',
          configured: !!dojahKey,
          tail: maskTail(dojahKey),
          mode: null,
        },
      ],
    },
    {
      id: 'sentry',
      name: 'Sentry',
      purpose: 'Error monitoring (optional)',
      dashboardUrl: 'https://sentry.io',
      status: sentryDsn ? 'ok' : 'missing',
      blocks: ['Unhandled errors are logged locally but not aggregated'],
      testable: false,
      keys: [
        {
          name: 'SENTRY_DSN',
          description: 'https://...@sentry.io/...',
          configured: !!sentryDsn,
          tail: maskTail(sentryDsn),
          mode: null,
        },
      ],
    },
  ];

  return NextResponse.json({ providers });
}
