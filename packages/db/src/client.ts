/**
 * Singleton Prisma client for use across apps.
 *
 * In development, reuses a single instance across hot-reloads.
 * Production creates a clean client per process.
 *
 * SETUP: Run `pnpm --filter @frenzpay/db generate` once DATABASE_URL is set.
 * The Prisma client types will then reflect the full schema.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient: _PrismaClient } = require('@prisma/client') as {
  PrismaClient: new (opts?: { log?: string[] }) => PrismaClientInstance;
};

// Minimal type for the Prisma client instance.
// Replaced with full generated types once `prisma generate` has run.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PrismaClientInstance = any;

// Re-export for consumers (both as value and type alias)
export { _PrismaClient as PrismaClient };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'P2P'
  | 'FX'
  | 'FEE'
  | 'REFUND'
  | 'LOCK'
  | 'UNLOCK'
  | 'CARD_AUTH'
  | 'CARD_CAPTURE'
  | 'CARD_REVERSAL';

// Prisma namespace — populated by generated client after `prisma generate`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export declare const Prisma: any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Prisma = any;

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClientInstance | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createPrismaClient(): any {
  return new _PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma: any =
  process.env.NODE_ENV === 'production'
    ? createPrismaClient()
    : (globalThis.__prisma ??= createPrismaClient());
