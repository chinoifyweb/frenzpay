/**
 * Legacy db helpers — replaced by Prisma in Phase 1.
 * This file is kept for backward compatibility with any remaining pages
 * that haven't yet been migrated to use prisma from @frenzpay/db.
 *
 * TODO: Remove this file when all consumers are migrated to Prisma.
 */

// Re-export prisma singleton as the primary DB client
export { prisma } from '@frenzpay/db';

// Stub out the old raw-SQL helpers so old call-sites don't break at compile time.
// These will throw at runtime if called — migrate callers to Prisma.
export async function query<T = Record<string, unknown>>(
  _text: string,
  _params?: unknown[],
): Promise<T[]> {
  throw new Error('query() is deprecated. Use prisma from @frenzpay/db instead.');
}

export async function queryOne<T = Record<string, unknown>>(
  _text: string,
  _params?: unknown[],
): Promise<T | null> {
  throw new Error('queryOne() is deprecated. Use prisma from @frenzpay/db instead.');
}
