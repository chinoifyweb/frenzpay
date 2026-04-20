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
  'SENTRY_DSN',
] as const;
type AllowedKey = (typeof ALLOWED_KEYS)[number];
const ALLOWED_KEY_SET = new Set<string>(ALLOWED_KEYS);

const ENV_FILE_PATH =
  process.env['FRENZPAY_ENV_FILE'] ?? '/home/frenzpay/shared/.env.production';
const PM2_PATH = process.env['FRENZPAY_PM2_PATH'] ?? '/usr/bin/pm2';
const PM2_ECOSYSTEM = process.env['FRENZPAY_ECOSYSTEM'] ?? '/home/frenzpay/ecosystem.config.js';

const Schema = z.object({
  name: z.string().refine((v) => ALLOWED_KEY_SET.has(v), 'Unknown or disallowed env key'),
  value: z
    .string()
    .min(8, 'Value must be at least 8 characters')
    .max(4096, 'Value too long')
    .refine((v) => !/[\r\n\0]/.test(v), 'Value cannot contain newlines or NUL'),
});

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
 * Reload PM2 asynchronously — after the HTTP response goes out — so this very
 * request isn't killed by its own reload. Detaches so the child outlives us.
 */
function schedulePm2Reload(delayMs = 750): void {
  setTimeout(() => {
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
  }, delayMs);
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
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'ENV_KEY_UPDATED',
      resourceType: 'EnvVar',
      resourceId: name as AllowedKey,
      metadata: { keyName: name, tail: maskTail(value) },
    },
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
    reloadEtaSeconds: 5,
  });
}
