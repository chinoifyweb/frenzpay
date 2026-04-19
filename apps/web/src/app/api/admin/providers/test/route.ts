/**
 * POST /api/admin/providers/test
 *
 * Body: { provider: 'bridge' }
 *
 * Pings a cheap read-only endpoint on the given provider to confirm that the
 * configured API key authenticates. Returns ok/statusCode/latencyMs/message.
 *
 * Never returns provider response bodies wholesale — they may contain customer
 * PII. We only extract a count / a single well-known field for confirmation.
 *
 * Dojah intentionally isn't testable here: it bills per call and has no free
 * status endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';

const Schema = z.object({
  provider: z.enum(['bridge']),
});

interface TestResult {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number;
  message: string;
  sample?: string;
}

async function testBridge(): Promise<TestResult> {
  const apiKey = process.env['BRIDGE_API_KEY'];
  const base = process.env['BRIDGE_API_BASE'] ?? 'https://api.bridge.xyz';

  if (!apiKey) {
    return {
      ok: false,
      statusCode: null,
      latencyMs: 0,
      message: 'BRIDGE_API_KEY is not configured on the server.',
    };
  }

  const started = Date.now();
  try {
    const res = await fetch(`${base}/v0/customers?limit=1`, {
      method: 'GET',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
    const latencyMs = Date.now() - started;

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        statusCode: res.status,
        latencyMs,
        message: 'Bridge rejected the key. Verify BRIDGE_API_KEY matches the one in your Bridge dashboard.',
      };
    }
    if (res.status >= 200 && res.status < 300) {
      let count: number | null = null;
      try {
        const json = (await res.json()) as { data?: unknown[]; count?: number };
        if (Array.isArray(json.data)) count = json.data.length;
        else if (typeof json.count === 'number') count = json.count;
      } catch { /* ignore body parse errors — we already know auth worked */ }
      return {
        ok: true,
        statusCode: res.status,
        latencyMs,
        message: 'Bridge authentication succeeded.',
        sample: count !== null ? `API returned ${count} customer record(s) on the sample page.` : undefined,
      };
    }
    return {
      ok: false,
      statusCode: res.status,
      latencyMs,
      message: `Bridge responded with HTTP ${res.status}. See logs for details.`,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      statusCode: null,
      latencyMs,
      message: `Network error contacting Bridge: ${msg}`,
    };
  }
}

export async function POST(req: NextRequest) {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

  const { provider } = parsed.data;

  let result: TestResult;
  if (provider === 'bridge') {
    result = await testBridge();
  } else {
    result = {
      ok: false,
      statusCode: null,
      latencyMs: 0,
      message: `No test implemented for provider '${provider as string}'`,
    };
  }

  return NextResponse.json({ provider, ...result });
}
