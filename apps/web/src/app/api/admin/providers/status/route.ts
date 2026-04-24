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
  id: 'graph' | 'sentry';
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

  const graphKey = process.env['GRAPH_API_KEY'];
  const graphWebhook = process.env['GRAPH_WEBHOOK_SECRET'];
  const graphEnv = process.env['GRAPH_ENVIRONMENT'] ?? 'test';
  const graphWebhookVerify = process.env['GRAPH_WEBHOOK_VERIFY'] ?? '1';
  const sentryDsn = process.env['SENTRY_DSN'];

  // Bridge provider is intentionally not surfaced here \u2014 it's managed on the
  // legacy admin at admin.frenzpay.co/settings by operator preference.
  const providers: ProviderStatus[] = [
    {
      id: 'graph',
      name: 'Graph',
      purpose: 'USD / EUR virtual accounts that settle to NGN (Nigerian rail)',
      dashboardUrl: 'https://app.useoval.com',
      status: graphKey && graphWebhook ? 'ok' : graphKey || graphWebhook ? 'partial' : 'missing',
      blocks: [
        'USD \u2192 NGN virtual account provisioning',
        'EUR \u2192 NGN virtual account provisioning',
        'Graph-issued virtual / physical cards',
        'NGN payouts to Nigerian banks + mobile money',
      ],
      testable: !!graphKey,
      keys: [
        {
          name: 'GRAPH_API_KEY',
          description: 'Bearer token from Graph dashboard \u2192 Developers \u2192 API Keys. Sandbox + live use the same URL; the key determines the env.',
          configured: !!graphKey,
          tail: maskTail(graphKey),
          mode: null,
        },
        {
          name: 'GRAPH_WEBHOOK_SECRET',
          description: 'Shared secret used to verify incoming Graph webhooks (HMAC-SHA256 default).',
          configured: !!graphWebhook,
          tail: maskTail(graphWebhook),
          mode: null,
        },
        {
          name: 'GRAPH_ENVIRONMENT',
          description: "Which Graph environment to hit: 'test' (sandbox, default) or 'live' (production). Must be flipped to 'live' before onboarding real customers.",
          configured: true,
          tail: graphEnv, // not a secret \u2014 display the actual value
          mode: graphEnv === 'live' ? 'live' : 'test',
        },
        {
          name: 'GRAPH_WEBHOOK_VERIFY',
          description: "Signature-verification gate: '1' = enforce HMAC-SHA256 check (default), '0' = accept unsigned webhooks (use ONLY during initial Graph handshake until the signing scheme is confirmed).",
          configured: true,
          tail: graphWebhookVerify,
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
