/**
 * Shared Bridge onboarding helpers.
 *
 * Split into two concerns:
 *   - ensureBridgeCustomer(userId)                 — create / reuse the Bridge
 *                                                     customer record (once
 *                                                     per user, currency-
 *                                                     agnostic)
 *   - ensureBridgeVirtualAccount(userId, currency) — create / reuse a virtual
 *                                                     account in the given
 *                                                     currency. The user
 *                                                     picks which rail to
 *                                                     activate: USD, EUR,
 *                                                     etc. No default.
 *
 * Idempotent: repeated calls return the existing record without hitting
 * Bridge again. Safe to invoke from:
 *   - KYC approval flow                    (creates customer only)
 *   - /api/accounts/activate               (user picks a currency, creates VA)
 *   - Admin "re-provision" action          (future)
 *   - A reconcile cron                     (future)
 *
 * Errors are returned rather than thrown so the caller can decide whether
 * to block its own flow on a Bridge outage. KYC approval should NOT fail
 * end-to-end just because Bridge is temporarily down.
 */

import { prisma } from '@frenzpay/db';
import {
  createBridgeCustomer,
  createBridgeVirtualAccount,
  generateBridgeIdempotencyKey,
} from '@frenzpay/providers/bridge';
import { logger } from '@frenzpay/logger';

export type ActivationCurrency = 'USD' | 'EUR';

export interface BridgeCustomerResult {
  ok: boolean;
  customerId?: string;
  bridgeStatus?: string;
  created: boolean;
  error?: string;
}

export interface BridgeVirtualAccountResult {
  ok: boolean;
  virtualAccountId?: string;
  accountNumber?: string;
  routingNumber?: string;
  bankName?: string;
  accountName?: string;
  settlementCurrency?: string;
  created: boolean;
  error?: string;
}

// ── Customer ───────────────────────────────────────────────────────────────

/**
 * Create the Bridge customer record for a user, or return the existing one.
 * Called at KYC approval time. Does NOT create a virtual account — that's
 * a separate per-currency step the user triggers themselves.
 */
export async function ensureBridgeCustomer(
  userId: string,
  options: { triggeredBy?: 'user' | 'admin' | 'system'; adminId?: string } = {},
): Promise<BridgeCustomerResult> {
  const { triggeredBy = 'user', adminId } = options;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      kycTier: true,
      externalAccounts: {
        where: { provider: 'bridge', type: 'bridge_customer' },
        select: { id: true, externalAccountId: true, status: true },
        take: 1,
      },
    },
  });

  if (!user) return { ok: false, created: false, error: 'User not found' };
  if (!user.firstName || !user.lastName || !user.email) {
    return {
      ok: false,
      created: false,
      error: 'User is missing firstName / lastName / email — cannot onboard to Bridge yet.',
    };
  }

  // Short-circuit if already created
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = user.externalAccounts[0];
  if (existing) {
    return {
      ok: true,
      customerId: existing.externalAccountId,
      bridgeStatus: existing.status ?? undefined,
      created: false,
    };
  }

  try {
    const result = await createBridgeCustomer({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      country: 'NG',
      internalUserId: user.id,
    });

    const row = await prisma.userExternalAccount.create({
      data: {
        userId: user.id,
        provider: 'bridge',
        externalAccountId: result.customerId,
        type: 'bridge_customer',
        currency: 'USD',  // customer row is currency-agnostic but the column is non-null
        status: result.status,
        metadata: { bridgeStatus: result.status, triggeredBy, adminId: adminId ?? null },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: adminId ?? user.id,
        action: 'BRIDGE_CUSTOMER_CREATED',
        resourceType: 'UserExternalAccount',
        resourceId: row.id,
        metadata: {
          bridgeCustomerId: result.customerId,
          bridgeStatus: result.status,
          targetUserId: user.id,
          triggeredBy,
        },
      },
    });

    logger.info(
      { userId: user.id, customerId: result.customerId, triggeredBy },
      'Bridge customer created',
    );

    return {
      ok: true,
      customerId: result.customerId,
      bridgeStatus: result.status,
      created: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ userId, err: message }, 'Bridge customer creation failed');
    return { ok: false, created: false, error: message };
  }
}

// ── Virtual account (per currency) ─────────────────────────────────────────

/**
 * Create a Bridge virtual account in the given currency for a user, or
 * return the existing one. Requires the Bridge customer to exist — call
 * ensureBridgeCustomer() first.
 *
 * Currency is USD for now (Bridge's primary rail). EUR is intentionally
 * allowed in the type union because the user-facing UI surfaces both, but
 * Bridge will reject EUR until we wire a secondary provider (ClearBank /
 * SEPA). The error surface returns cleanly so the UI can show
 * "EUR coming soon" instead of crashing.
 */
export async function ensureBridgeVirtualAccount(
  userId: string,
  currency: ActivationCurrency,
  options: { triggeredBy?: 'user' | 'admin' | 'system'; adminId?: string } = {},
): Promise<BridgeVirtualAccountResult> {
  const { triggeredBy = 'user', adminId } = options;

  if (currency !== 'USD') {
    return {
      ok: false,
      created: false,
      error: `${currency} virtual accounts are not yet available. USD is the only active rail.`,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      externalAccounts: {
        where: { provider: 'bridge' },
        select: {
          id: true,
          type: true,
          externalAccountId: true,
          currency: true,
          accountNumber: true,
          routingNumber: true,
          bankName: true,
          accountName: true,
          status: true,
          metadata: true,
        },
      },
    },
  });

  if (!user) return { ok: false, created: false, error: 'User not found' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customerRow = user.externalAccounts.find((a: any) => a.type === 'bridge_customer');
  if (!customerRow) {
    return {
      ok: false,
      created: false,
      error: 'Bridge customer does not exist. Complete KYC first.',
    };
  }

  // Existing VA in the requested currency (settlement currency may be USDC
  // when the rail is USD — we look up by the metadata.activationCurrency tag
  // we set below on create).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingVA = user.externalAccounts.find((a: any) => {
    if (a.type !== 'virtual_account') return false;
    const meta = (a.metadata ?? {}) as { activationCurrency?: string };
    return meta.activationCurrency === currency;
  });

  if (existingVA) {
    return {
      ok: true,
      virtualAccountId: existingVA.externalAccountId,
      accountNumber: existingVA.accountNumber ?? undefined,
      routingNumber: existingVA.routingNumber ?? undefined,
      bankName: existingVA.bankName ?? undefined,
      accountName: existingVA.accountName ?? undefined,
      settlementCurrency: existingVA.currency ?? undefined,
      created: false,
    };
  }

  try {
    const idempotencyKey = generateBridgeIdempotencyKey(`va-${currency.toLowerCase()}-${user.id}`);
    const vaResult = await createBridgeVirtualAccount(customerRow.externalAccountId, idempotencyKey);

    const vaRow = await prisma.userExternalAccount.create({
      data: {
        userId: user.id,
        provider: 'bridge',
        externalAccountId: vaResult.virtualAccountId,
        type: 'virtual_account',
        currency: vaResult.settlementCurrency,   // usually USDC for USD rail
        accountName: vaResult.accountName,
        routingNumber: vaResult.routingNumber,
        accountNumber: vaResult.accountNumber,
        bankName: vaResult.bankName,
        status: 'active',
        metadata: {
          idempotencyKey,
          activationCurrency: currency,          // what the user requested (USD / EUR)
          settlementCurrency: vaResult.settlementCurrency,
          triggeredBy,
          adminId: adminId ?? null,
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: adminId ?? user.id,
        action: 'BRIDGE_VIRTUAL_ACCOUNT_CREATED',
        resourceType: 'UserExternalAccount',
        resourceId: vaRow.id,
        metadata: {
          virtualAccountId: vaResult.virtualAccountId,
          activationCurrency: currency,
          settlementCurrency: vaResult.settlementCurrency,
          bankName: vaResult.bankName,
          targetUserId: user.id,
          triggeredBy,
        },
      },
    });

    logger.info(
      {
        userId: user.id,
        virtualAccountId: vaResult.virtualAccountId,
        currency,
        triggeredBy,
      },
      'Bridge virtual account created',
    );

    return {
      ok: true,
      virtualAccountId: vaResult.virtualAccountId,
      accountNumber: vaResult.accountNumber,
      routingNumber: vaResult.routingNumber,
      bankName: vaResult.bankName,
      accountName: vaResult.accountName,
      settlementCurrency: vaResult.settlementCurrency,
      created: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ userId, currency, err: message }, 'Bridge virtual account creation failed');
    return { ok: false, created: false, error: message };
  }
}
