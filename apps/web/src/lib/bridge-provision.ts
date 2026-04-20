/**
 * Shared Bridge onboarding helper.
 *
 * Takes a FrenzPay user and ensures they have:
 *   1. A Bridge customer record (UserExternalAccount with type='bridge_customer')
 *   2. A virtual USD account (UserExternalAccount with type='virtual_account')
 *
 * Idempotent: if either record already exists, it's reused. Safe to call
 * from:
 *   - /api/accounts/usd/provision          (user-triggered)
 *   - /api/admin/kyc/[id] on T2 approval   (admin-triggered, auto)
 *   - A cron job / retry queue             (future: reconcile failed T2s)
 *
 * Errors are returned rather than thrown so the caller can decide whether
 * to block its own flow on a Bridge outage. KYC approval should NOT fail
 * end-to-end just because Bridge is temporarily down — we log and let
 * ops retry.
 */

import { prisma } from '@frenzpay/db';
import {
  createBridgeCustomer,
  createBridgeVirtualAccount,
  generateBridgeIdempotencyKey,
} from '@frenzpay/providers/bridge';
import { logger } from '@frenzpay/logger';

export interface BridgeProvisionResult {
  ok: boolean;
  customerId?: string;
  virtualAccountId?: string;
  accountNumber?: string;
  routingNumber?: string;
  bankName?: string;
  created: {
    customer: boolean;
    virtualAccount: boolean;
  };
  error?: string;
}

export async function provisionBridgeForUser(
  userId: string,
  options: { triggeredBy?: 'user' | 'admin' | 'system'; adminId?: string } = {},
): Promise<BridgeProvisionResult> {
  const { triggeredBy = 'user', adminId } = options;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      kycTier: true,
      status: true,
      externalAccounts: {
        where: { provider: 'bridge' },
        select: {
          id: true,
          type: true,
          externalAccountId: true,
          accountNumber: true,
          routingNumber: true,
          bankName: true,
          status: true,
          currency: true,
        },
      },
    },
  });

  if (!user) {
    return { ok: false, created: { customer: false, virtualAccount: false }, error: 'User not found' };
  }

  if (!user.firstName || !user.lastName || !user.email) {
    return {
      ok: false,
      created: { customer: false, virtualAccount: false },
      error: 'User is missing firstName / lastName / email — cannot onboard to Bridge yet',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingCustomer = user.externalAccounts.find((a: any) => a.type === 'bridge_customer');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingVA = user.externalAccounts.find((a: any) => a.type === 'virtual_account');

  // Short-circuit: already fully provisioned
  if (existingCustomer && existingVA) {
    return {
      ok: true,
      customerId: existingCustomer.externalAccountId,
      virtualAccountId: existingVA.externalAccountId,
      accountNumber: existingVA.accountNumber ?? undefined,
      routingNumber: existingVA.routingNumber ?? undefined,
      bankName: existingVA.bankName ?? undefined,
      created: { customer: false, virtualAccount: false },
    };
  }

  let customerId: string;
  let customerCreated = false;

  try {
    if (existingCustomer) {
      customerId = existingCustomer.externalAccountId;
    } else {
      const customerResult = await createBridgeCustomer({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        country: 'NG',
        internalUserId: user.id,
      });
      customerId = customerResult.customerId;
      customerCreated = true;

      const row = await prisma.userExternalAccount.create({
        data: {
          userId: user.id,
          provider: 'bridge',
          externalAccountId: customerId,
          type: 'bridge_customer',
          currency: 'USD',
          status: customerResult.status,
          metadata: { bridgeStatus: customerResult.status, triggeredBy, adminId: adminId ?? null },
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: adminId ?? user.id,
          action: 'BRIDGE_CUSTOMER_CREATED',
          resourceType: 'UserExternalAccount',
          resourceId: row.id,
          metadata: {
            bridgeCustomerId: customerId,
            bridgeStatus: customerResult.status,
            targetUserId: user.id,
            triggeredBy,
          },
        },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ userId, err: message }, 'Bridge customer creation failed');
    return {
      ok: false,
      created: { customer: false, virtualAccount: false },
      error: `Bridge customer creation failed: ${message}`,
    };
  }

  // Virtual account
  if (existingVA) {
    return {
      ok: true,
      customerId,
      virtualAccountId: existingVA.externalAccountId,
      accountNumber: existingVA.accountNumber ?? undefined,
      routingNumber: existingVA.routingNumber ?? undefined,
      bankName: existingVA.bankName ?? undefined,
      created: { customer: customerCreated, virtualAccount: false },
    };
  }

  try {
    const idempotencyKey = generateBridgeIdempotencyKey(`va-${user.id}`);
    const vaResult = await createBridgeVirtualAccount(customerId, idempotencyKey);

    const vaRow = await prisma.userExternalAccount.create({
      data: {
        userId: user.id,
        provider: 'bridge',
        externalAccountId: vaResult.virtualAccountId,
        type: 'virtual_account',
        currency: vaResult.settlementCurrency,
        accountName: vaResult.accountName,
        routingNumber: vaResult.routingNumber,
        accountNumber: vaResult.accountNumber,
        bankName: vaResult.bankName,
        status: 'active',
        metadata: {
          idempotencyKey,
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
          bankName: vaResult.bankName,
          targetUserId: user.id,
          triggeredBy,
        },
      },
    });

    logger.info(
      { userId: user.id, customerId, virtualAccountId: vaResult.virtualAccountId, triggeredBy },
      'Bridge onboarding complete',
    );

    return {
      ok: true,
      customerId,
      virtualAccountId: vaResult.virtualAccountId,
      accountNumber: vaResult.accountNumber,
      routingNumber: vaResult.routingNumber,
      bankName: vaResult.bankName,
      created: { customer: customerCreated, virtualAccount: true },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ userId, customerId, err: message }, 'Bridge virtual account creation failed');
    return {
      ok: false,
      customerId,
      created: { customer: customerCreated, virtualAccount: false },
      error: `Bridge virtual account creation failed: ${message}`,
    };
  }
}
