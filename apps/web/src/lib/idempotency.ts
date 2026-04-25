/**
 * Idempotency-Key helper for money-handling routes.
 *
 * Why this exists:
 *   The previous pattern was server-generated keys like
 *   `withdraw-${userId}-${Date.now()}-${Math.random()}`. On retry (network
 *   timeout, brief 502, browser flake) the client would send the same
 *   request again and the server would mint a *new* key — bypassing
 *   `Transaction.idempotencyKey`'s unique constraint and posting the
 *   debit twice. Real money loss.
 *
 * The fix:
 *   Require the client to send an `Idempotency-Key` header on every
 *   POST that moves money. The key is namespaced server-side so a
 *   collision between two different operations (e.g. a withdrawal and
 *   an FX conversion both supplying `Idempotency-Key: abc`) can't
 *   accidentally dedupe across endpoints.
 *
 * Format we accept:
 *   16..128 chars, [A-Za-z0-9_-] only. UUIDs, ULIDs, nanoid all match.
 *   Long enough to be globally unique per client; short enough to fit
 *   comfortably in our DB index.
 */

import { NextResponse } from 'next/server';

const KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export type IdempotencyResult =
  | { ok: true; key: string }
  | { ok: false; response: NextResponse };

/**
 * Read + validate the `Idempotency-Key` header. Returns the namespaced key
 * on success, or a ready-to-return 400 NextResponse on failure.
 *
 * Usage:
 *   const idem = getIdempotencyKey(req, 'withdraw');
 *   if (!idem.ok) return idem.response;
 *   const idempotencyKey = idem.key;   // e.g. "withdraw:01HK..."
 */
export function getIdempotencyKey(
  req: Request,
  namespace: string,
): IdempotencyResult {
  const raw = req.headers.get('idempotency-key') ?? req.headers.get('Idempotency-Key');

  if (!raw) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Idempotency-Key header is required',
          hint:
            'Generate a UUID/ULID/nanoid client-side and send it as the ' +
            '`Idempotency-Key` header. Reuse the same value if you retry ' +
            'the request after a network failure.',
        },
        { status: 400 },
      ),
    };
  }

  const trimmed = raw.trim();
  if (!KEY_PATTERN.test(trimmed)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Invalid Idempotency-Key',
          hint: 'Must be 16..128 characters, [A-Za-z0-9_-] only.',
        },
        { status: 400 },
      ),
    };
  }

  // Namespace prevents cross-endpoint collisions: a client that uses the
  // same UUID for two different POSTs (e.g. one withdrawal + one
  // conversion) doesn't accidentally make the second one dedupe against
  // the first.
  return { ok: true, key: `${namespace}:${trimmed}` };
}
