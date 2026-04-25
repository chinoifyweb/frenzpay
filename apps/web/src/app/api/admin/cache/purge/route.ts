/**
 * POST /api/admin/cache/purge
 *
 * Issue a vhost-wide LSCache purge.
 *
 * LiteSpeed Web Server purges its edge cache when an origin response
 * carries the `X-LiteSpeed-Purge` header. `*` purges everything for the
 * current vhost; pass a path/tag to scope it. Because this endpoint sits
 * under /api/* (which itself is uncached) every call reaches origin and
 * therefore actually triggers the flush — unlike adding the header to
 * `/`, which would never re-hit origin while a stale entry is fresh.
 *
 * Authenticated as admin via the standard session cookie. Audit-logged
 * so we can see who busted the cache and when.
 */

import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { logger } from '@frenzpay/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const url = new URL(req.url);

  // Two ways to authorise:
  //   1. Admin session cookie (regular use from the dashboard).
  //   2. ?token=<CACHE_PURGE_TOKEN> query param matching the env-var secret.
  //      Lets the deploy script + ops scripts flush the edge cache without
  //      needing to mint an admin session. Token is required to be non-empty.
  let actor: string;
  const token = url.searchParams.get('token');
  const expected = process.env['CACHE_PURGE_TOKEN'];
  if (token && expected && token.length > 0 && token === expected) {
    actor = 'system:purge-token';
  } else {
    const { session } = await requireSession();
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actor = session.userId;
  }

  // Optional `?scope=/some/path` query param. Defaults to "*" (whole vhost).
  const scope = url.searchParams.get('scope') || '*';

  try {
    // Audit log only when an admin user actually drove this. The token path
    // is internal/automation and we don't have a userId to attribute it to.
    if (actor !== 'system:purge-token') {
      await prisma.adminAuditLog.create({
        data: {
          adminId: actor,
          action: 'LSCACHE_PURGED',
          resourceType: 'Cache',
          metadata: { scope },
        },
      });
    }
  } catch (err) {
    // Audit failure is non-fatal — we still want the purge to fire.
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      'cache-purge audit log write failed',
    );
  }

  logger.info({ actor, scope }, 'lscache purge issued');

  return new NextResponse(JSON.stringify({ ok: true, scope }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // The magic header — LSCache reads this on origin response.
      'X-LiteSpeed-Purge': scope,
      // Don't cache the purge response itself.
      'X-LiteSpeed-Cache-Control': 'no-cache, no-store, private',
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
