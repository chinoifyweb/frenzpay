/**
 * Graph rail provisioning — the Graph equivalent of bridge-provision.ts.
 *
 * One public entry point for now:
 *   ensureGraphBankAccount(userId, currency)
 *     Creates a virtual bank account on Graph (USD/EUR inbound → NGN settlement,
 *     or native NGN) for the user, or returns the existing one.
 *
 * Pre-conditions:
 *   - user.graphPersonId is set. If not, attempt syncUserToGraph first and
 *     return the error if that also fails.
 *
 * Idempotent: we key UserExternalAccount by (userId, provider='graph', currency).
 * Repeated calls return the same row.
 */

import { prisma } from '@frenzpay/db';
import { logger } from '@frenzpay/logger';
import {
  createGraphBankAccount,
  type GraphBankAccountCurrency,
  type GraphBankAccountResult,
  isGraphConfigured,
} from '@frenzpay/providers/graph';
import { syncUserToGraph } from './graph-sync';

export type GraphActivationCurrency = GraphBankAccountCurrency;

export interface EnsureGraphAccountResult {
  ok: boolean;
  created?: boolean;
  virtualAccountId?: string;
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
  bankCode?: string;
  routingNumber?: string;
  swiftCode?: string;
  currency?: string;
  settlementCurrency?: string;
  error?: string;
}

/**
 * Ensure a user has an active virtual account on Graph for the given currency.
 * Returns the existing record, or creates a new one. Never throws.
 */
export async function ensureGraphBankAccount(
  userId: string,
  currency: GraphActivationCurrency,
  opts?: { label?: string; triggeredBy?: 'user' | 'admin' },
): Promise<EnsureGraphAccountResult> {
  if (!isGraphConfigured()) {
    return { ok: false, error: 'Graph rail is not configured (GRAPH_API_KEY missing).' };
  }

  // ── Existing account? ──────────────────────────────────────────────────
  const existing = await prisma.userExternalAccount.findFirst({
    where: {
      userId,
      provider: 'graph',
      currency,
      // Treat anything other than 'closed' as reusable
      NOT: { status: 'closed' },
    },
    select: {
      id: true,
      externalAccountId: true,
      accountName: true,
      accountNumber: true,
      bankName: true,
      routingNumber: true,
      currency: true,
      metadata: true,
    },
  });
  if (existing) {
    const meta = (existing.metadata ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      created: false,
      virtualAccountId: existing.externalAccountId,
      accountNumber: existing.accountNumber ?? undefined,
      accountName: existing.accountName ?? undefined,
      bankName: existing.bankName ?? undefined,
      bankCode: typeof meta['bank_code'] === 'string' ? (meta['bank_code'] as string) : undefined,
      routingNumber: existing.routingNumber ?? undefined,
      swiftCode: typeof meta['swift_code'] === 'string' ? (meta['swift_code'] as string) : undefined,
      currency: existing.currency,
      settlementCurrency:
        typeof meta['settlement_currency'] === 'string'
          ? (meta['settlement_currency'] as string)
          : existing.currency,
    };
  }

  // ── Ensure graphPersonId exists ────────────────────────────────────────
  let user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, graphPersonId: true, kycTier: true, status: true },
  });
  if (!user) return { ok: false, error: 'User not found' };
  if (user.status !== 'ACTIVE') {
    return { ok: false, error: 'User account is not active.' };
  }
  if (user.kycTier !== 'T2' && user.kycTier !== 'T3') {
    return { ok: false, error: 'KYC T2+ required before provisioning a virtual account.' };
  }

  if (!user.graphPersonId) {
    // Try to create the Person now as a belt-and-braces recovery from a
    // KYC approval that failed mid-flight.
    const sync = await syncUserToGraph(userId);
    if (!sync.ok || !sync.graphPersonId) {
      return {
        ok: false,
        error:
          sync.error ??
          'User has no Graph Person yet — KYC approval must create one before account provisioning.',
      };
    }
    user = { ...user, graphPersonId: sync.graphPersonId };
  }

  // ── Create on Graph ────────────────────────────────────────────────────
  const label = opts?.label ?? `frenzpay-${currency.toLowerCase()}`;
  let result: GraphBankAccountResult;
  try {
    result = await createGraphBankAccount(
      {
        person_id: user.graphPersonId!,
        label,
        currency,
      },
      { idempotencyKey: `bank_account-${userId}-${currency}` },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ userId, currency, err: msg }, 'Graph bank_account creation failed');
    return { ok: false, error: msg };
  }

  // ── Persist ────────────────────────────────────────────────────────────
  try {
    await prisma.userExternalAccount.create({
      data: {
        userId,
        provider: 'graph',
        externalAccountId: result.bankAccountId,
        type: 'virtual_account',
        currency,
        accountName: result.accountName,
        accountNumber: result.accountNumber,
        routingNumber: result.routingNumber,
        bankName: result.bankName,
        status: result.status ?? 'active',
        metadata: {
          triggered_by: opts?.triggeredBy ?? 'user',
          settlement_currency: result.settlementCurrency,
          bank_code: result.bankCode,
          swift_code: result.swiftCode,
          raw: result.rawResponse as Record<string, unknown> | undefined,
        } as Record<string, unknown>,
      },
    });
  } catch (err) {
    // If we collided on an earlier create (race), fall back to returning what
    // Graph gave us — the row is materialising from another request.
    logger.warn(
      { userId, err: err instanceof Error ? err.message : err },
      'UserExternalAccount persistence failed; returning Graph response anyway',
    );
  }

  logger.info(
    { userId, currency, bankAccountId: result.bankAccountId, label },
    'Graph bank_account provisioned',
  );

  return {
    ok: true,
    created: true,
    virtualAccountId: result.bankAccountId,
    accountNumber: result.accountNumber,
    accountName: result.accountName,
    bankName: result.bankName,
    bankCode: result.bankCode,
    routingNumber: result.routingNumber,
    swiftCode: result.swiftCode,
    currency: result.currency,
    settlementCurrency: result.settlementCurrency,
  };
}
