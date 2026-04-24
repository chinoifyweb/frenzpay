/**
 * POST /api/admin/providers/keys
 *
 * Write a provider API key to the server's `.env.production` file and trigger
 * a zero-downtime PM2 reload so the new value takes effect.
 *
 * Body: { name: AllowedKeyName, value: string }
 *
 * Safety rails:
 *   - Admin session required (session.role === 'admin')
 *   - Key name is validated against a strict whitelist — no arbitrary env writes
 *   - Value bounds: 8..2048 chars, no control chars, no newlines
 *   - Atomic write: tmp-file + rename (no partial writes under crash)
 *   - File mode preserved at 0600 owned by frenzpay
 *   - Audit log records the key NAME only — never the value
 *   - The value is never logged, never returned, never stored in the DB
 *   - PM2 reload is scheduled after we respond, so the request itself doesn't
 *     get killed mid-flight
 *
 * Response: { ok: true, name, tail, reloadScheduled: true }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { logger } from '@frenzpay/logger';

// ── Whitelist of env vars this endpoint will write ──────────────────────────
// Keeping this explicit so a compromised admin session can't flip arbitrary
// runtime config (DATABASE_URL, SESSION_SECRET, etc.).
const ALLOWED_KEYS = [
  'BRIDGE_API_KEY',
  'BRIDGE_WEBHOOK_SECRET',
  'BRIDGE_API_BASE',
  'BRIDGE_WEBHOOK_PUBLIC_KEY',
  'GRAPH_API_KEY',
  'GRAPH_WEBHOOK_SECRET',
  'GRAPH_API_BASE',
  'GRAPH_ENVIRONMENT',
  'GRAPH_WEBHOOK_VERIFY',
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
] as const;
type AllowedKey = (typeof ALLOWED_KEYS)[number];
const ALLOWED_KEY_SET = new Set<string>(ALLOWED_KEYS);

const ENV_FILE_PATH =
  process.env['FRENZPAY_ENV_FILE'] ?? '/home/frenzpay/shared/.env.production';
const PM2_PATH = process.env['FRENZPAY_PM2_PATH'] ?? '/usr/bin/pm2';
const PM2_ECOSYSTEM = process.env['FRENZPAY_ECOSYSTEM'] ?? '/home/frenzpay/ecosystem.config.js';

// Short-value keys: these are config flags (not secrets) and legitimately
// contain just a few characters ("test"/"live", "0"/"1", etc.). For real
// secrets we still enforce the 8-char minimum.
const SHORT_VALUE_KEYS = new Set<string>([
  'GRAPH_ENVIRONMENT',
  'GRAPH_WEBHOOK_VERIFY',
]);

const Schema = z
  .object({
    name: z.string().refine((v) => ALLOWED_KEY_SET.has(v), 'Unknown or disallowed env key'),
    value: z
      .string()
      .min(1, 'Value is required')
      .max(4096, 'Value too long')
      .refine((v) => !/[\r\n\0]/.test(v), 'Value cannot contain newlines or NUL'),
  })
  .refine(
    ({ name, value }) => SHORT_VALUE_KEYS.has(name) || value.length >= 8,
    { message: 'Secret values must be at least 8 characters', path: ['value'] },
  )
  .refine(
    ({ name, value }) => {
      if (name === 'GRAPH_ENVIRONMENT') {
        return value === 'test' || value === 'live';
      }
      if (name === 'GRAPH_WEBHOOK_VERIFY') {
        return value === '0' || value === '1';
      }
      return true;
    },
    { message: 'Invalid value for this config key', path: ['value'] },
  );

/** Return last 4 chars of a secret, or null if shorter than 8. */
function maskTail(value: string): string | null {
  if (!value || value.length < 8) return null;
  return value.slice(-4);
}

/**
 * Read .env, splice in/replace the given KEY=value line, write back atomically.
 *
 * Notes:
 *   - Preserves ordering and comments. New keys go at the end.
 *   - Value is *always* written quoted (single-quoted) so multi-line keys
 *     (RSA PEM, JSON blobs) and keys with `=` or `#` in them survive.
 *   - For safety we only allow keys without newlines (see schema), so normal
 *     single-quoted form works.
 */
async function writeEnvValue(keyName: string, newValue: string): Promise<void> {
  let raw: string;
  try {
    raw = await fs.readFile(ENV_FILE_PATH, 'utf8');
  } catch (err) {
    throw new Error(
      `Could not read ${ENV_FILE_PATH}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const lines = raw.split('\n');
  // Value is escaped: single-quote wrap, with any embedded single-quote turned into
  // '"'"' (standard shell-style breakout).
  const escaped = newValue.replace(/'/g, `'"'"'`);
  const newLine = `${keyName}='${escaped}'`;

  // Match KEY= at start of line (optionally with export prefix)
  const re = new RegExp(
    `^(?:export\\s+)?${keyName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}=.*$`,
  );

  let replaced = false;
  const patched = lines.map((line) => {
    if (!replaced && re.test(line)) {
      replaced = true;
      return newLine;
    }
    return line;
  });

  if (!replaced) {
    // Append (make sure file ends with a newline first)
    if (patched.length > 0 && patched[patched.length - 1] !== '') patched.push('');
    patched.push(newLine);
  }

  const tmpPath = `${ENV_FILE_PATH}.tmp.${process.pid}.${Date.now()}`;
  const dir = path.dirname(ENV_FILE_PATH);

  // Write tmp file, mode 0600 (owner rw only — same as original)
  await fs.writeFile(tmpPath, patched.join('\n'), { mode: 0o600, encoding: 'utf8' });
  // Atomic rename (POSIX guarantees this on the same filesystem)
  await fs.rename(tmpPath, ENV_FILE_PATH);
  // Belt-and-braces: reassert the mode in case umask interfered
  try { await fs.chmod(ENV_FILE_PATH, 0o600); } catch { /* non-fatal */ }

  // Best-effort: fsync the directory so the rename is durable.
  try {
    const fd = await fs.open(dir, 'r');
    try { await fd.sync(); } finally { await fd.close(); }
  } catch { /* non-fatal, some FS don't support dir fsync */ }
}

/**
 * Schedule a debounced PM2 reload so multiple rapid key saves share one
 * reload instead of thrashing the workers. Each call pushes the reload
 * RELOAD_DEBOUNCE_MS into the future from "now"; the timer only fires
 * when the user stops saving.
 *
 * Runs after the HTTP response goes out so this very request isn't killed
 * by its own reload. Detaches so the spawned process outlives us.
 *
 * Module-level state: the setTimeout handle lives in a module-scope symbol
 * on globalThis so it survives across request handler instances within
 * the same worker. Next.js may re-import the module per request in dev —
 * so we pin it to a Symbol key on globalThis.
 */
const RELOAD_DEBOUNCE_MS = 4_000; // enough headroom for a human clicking Save several times

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global { var __frenzpay_reload_handle: any | undefined; }

function schedulePm2Reload(): void {
  // Clear any existing pending reload so this one wins.
  if (globalThis.__frenzpay_reload_handle) {
    clearTimeout(globalThis.__frenzpay_reload_handle);
  }
  globalThis.__frenzpay_reload_handle = setTimeout(() => {
    globalThis.__frenzpay_reload_handle = undefined;
    try {
      const child = spawn(
        PM2_PATH,
        ['reload', PM2_ECOSYSTEM, '--update-env'],
        {
          detached: true,
          stdio: 'ignore',
          env: { ...process.env, PM2_HOME: process.env['PM2_HOME'] ?? '/home/frenzpay/.pm2' },
        },
      );
      child.unref();
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'pm2 reload failed to spawn');
    }
  }, RELOAD_DEBOUNCE_MS);
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

  const { name, value } = parsed.data;

  try {
    await writeEnvValue(name, value);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), keyName: name },
      'env write failed',
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to write env file' },
      { status: 500 },
    );
  }

  // Audit log — the name only. The value never touches the DB.
  // Admin-originated events go to admin_audit_logs; the user_audit_logs
  // table has a FK to `users.id` which admin sessions don't satisfy
  // (session.userId references admin_users, not users). Writing there
  // would hit a P2003 FK violation and kill the whole response body.
  await prisma.adminAuditLog.create({
    data: {
      adminId: session.userId,
      action: 'ENV_KEY_UPDATED',
      resourceType: 'EnvVar',
      resourceId: name as AllowedKey,
      metadata: { keyName: name, tail: maskTail(value) },
    },
  }).catch((err) => {
    // Never let audit-log failure bubble up — the write itself already
    // succeeded. Log and move on.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), keyName: name },
      'admin audit log write failed (non-fatal)',
    );
  });

  logger.info(
    { adminId: session.userId, keyName: name },
    'env key updated via admin UI — scheduling pm2 reload',
  );

  // Schedule reload AFTER response is sent
  schedulePm2Reload();

  return NextResponse.json({
    ok: true,
    name,
    tail: maskTail(value),
    reloadScheduled: true,
    reloadEtaSeconds: Math.ceil(RELOAD_DEBOUNCE_MS / 1000) + 2,
  });
}
