/**
 * POST /api/accounts/usd/provision
 * Provisions a Bridge customer + USD virtual account for the authenticated user.
 *
 * Preconditions:
 * - User must be T2+ (full KYC, real banking requirement)
 * - User must have a first + last name on file (from T1 BVN verification)
 * - Idempotent: if an active virtual account exists, returns it unchanged
 *
 * Flow:
 * 1. Verify tier + KYC data exists
 * 2. Get-or-create Bridge customer (stored in UserExternalAccount with type='bridge_customer')
 * 3. Get-or-create virtual account (stored in UserExternalAccount with type='virtual_account')
 * 4. Write AuditLog entries
 * 5. Return the virtual account details (routing + account number)
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import {
  createBridgeCustomer,
  createBridgeVirtualAccount,
  generateBridgeIdempotencyKey,
} from '@frenzpay/providers/bridge';

export async function POST() {
  const { session } = await requireSession();

  // ── Precondition checks ────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      kycTier: true,
      kycStatus: true,
      externalAccounts: {
        where: { provider: 'bridge' },
        select: {
          id: true,
          type: true,
          externalAccountId: true,
          status: true,
          accountName: true,
          routingNumber: true,
          accountNumber: true,
          bankName: true,
          currency: true,
        },
      },
    },
  });

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (user.kycTier !== 'T2' && user.kycTier !== 'T3') {
    return NextResponse.json(
      { error: 'USD accounts require Advanced KYC (T2). Complete document verification first.' },
      { status: 403 },
    );
  }

  if (!user.firstName || !user.lastName) {
    return NextResponse.json(
      { error: 'First and last name missing. Complete T1 verification first.' },
      { status: 409 },
    );
  }

  // ── Idempotency: return existing virtual account if present ────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingVA = user.externalAccounts.find((a: any) => a.type === 'virtual_account' && a.status === 'active');
  if (existingVA) {
    return NextResponse.json({
      virtualAccount: {
        externalAccountId: existingVA.externalAccountId,
        accountName: existingVA.accountName,
        routingNumber: existingVA.routingNumber,
        accountNumber: existingVA.accountNumber,
        bankName: existingVA.bankName,
        currency: existingVA.currency,
      },
      created: false,
    });
  }

  // ── Get or create Bridge customer ──────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bridgeCustomerRow = user.externalAccounts.find((a: any) => a.type === 'bridge_customer');
  let customerId: string;

  if (bridgeCustomerRow) {
    customerId = bridgeCustomerRow.externalAccountId;
  } else {
    const customerResult = await createBridgeCustomer({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      country: 'NG',
      internalUserId: user.id,
    });

    customerId = customerResult.customerId;

    bridgeCustomerRow = await prisma.userExternalAccount.create({
      data: {
        userId: user.id,
        provider: 'bridge',
        externalAccountId: customerId,
        type: 'bridge_customer',
        currency: 'USD',
        status: customerResult.status,
        metadata: { bridgeStatus: customerResult.status },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'BRIDGE_CUSTOMER_CREATED',
        resourceType: 'UserExternalAccount',
        resourceId: bridgeCustomerRow.id,
        metadata: { bridgeCustomerId: customerId, bridgeStatus: customerResult.status },
      },
    });
  }

  // ── Create virtual account ─────────────────────────────────────────────────
  const idempotencyKey = generateBridgeIdempotencyKey(`va-${user.id}`);
  const vaResult = await createBridgeVirtualAccount(customerId, idempotencyKey);

  const virtualAccountRow = await prisma.userExternalAccount.create({
    data: {
      userId: user.id,
      provider: 'bridge',
      externalAccountId: vaResult.virtualAccountId,
      type: 'virtual_account',
      currency: vaResult.settlementCurrency, // typically USDC (settlement happens via Bridge)
      accountName: vaResult.accountName,
      routingNumber: vaResult.routingNumber,
      accountNumber: vaResult.accountNumber,
      bankName: vaResult.bankName,
      status: 'active',
      metadata: { idempotencyKey, settlementCurrency: vaResult.settlementCurrency },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'BRIDGE_VIRTUAL_ACCOUNT_CREATED',
      resourceType: 'UserExternalAccount',
      resourceId: virtualAccountRow.id,
      metadata: {
        virtualAccountId: vaResult.virtualAccountId,
        bankName: vaResult.bankName,
      },
    },
  });

  return NextResponse.json(
    {
      virtualAccount: {
        externalAccountId: vaResult.virtualAccountId,
        accountName: vaResult.accountName,
        routingNumber: vaResult.routingNumber,
        accountNumber: vaResult.accountNumber,
        bankName: vaResult.bankName,
        currency: vaResult.settlementCurrency,
      },
      created: true,
    },
    { status: 201 },
  );
}
