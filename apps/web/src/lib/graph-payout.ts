/**
 * Graph payout orchestration — used by the admin "approve withdrawal" flow.
 *
 * A Withdrawal row on our side already represents the user intent (source
 * amount in USD, destination NGN kobo, FX quote). This helper takes that row
 * and materialises a Graph PayoutDestination + Payout so Graph actually sends
 * the money to the recipient.
 *
 * Flow:
 *   1. Load Withdrawal + Beneficiary + user's USD Graph bank account (source).
 *   2. Ensure the user has a Graph Person (graphPersonId).
 *   3. POST /payout-destination with type=nip, bank_code + account_number.
 *   4. POST /payout with destination_id + USD subunit amount + description.
 *   5. Store Graph payout id as Withdrawal.externalRef + provider='graph'.
 *
 * Never throws — returns { ok, error }. The caller (admin approve) treats
 * failures as "admin needs to follow up" — not a reason to block the status
 * transition.
 */

import { prisma } from '@frenzpay/db';
import { logger } from '@frenzpay/logger';
import {
  createGraphPayoutDestination,
  createGraphPayout,
  type GraphPayoutDestinationNip,
  isGraphConfigured,
} from '@frenzpay/providers/graph';

export interface TriggerGraphPayoutResult {
  ok: boolean;
  payoutId?: string;
  destinationId?: string;
  error?: string;
  /** Skipped because the withdrawal provider isn't graph, or Graph not configured. */
  skipped?: boolean;
}

/**
 * Build + fire a Graph payout for an admin-approved Withdrawal.
 */
export async function triggerGraphPayoutForWithdrawal(
  withdrawalId: string,
): Promise<TriggerGraphPayoutResult> {
  if (!isGraphConfigured()) {
    return { ok: false, skipped: true, error: 'Graph is not configured' };
  }

  const withdrawal = await prisma.withdrawal.findUnique({
    where: { id: withdrawalId },
    select: {
      id: true,
      sourceAmountCents: true,
      provider: true,
      beneficiaryId: true,
      externalRef: true,
      transaction: {
        select: {
          id: true,
          initiatorUserId: true,
          currency: true,
        },
      },
    },
  });
  if (!withdrawal) return { ok: false, error: 'Withdrawal not found' };

  if (withdrawal.externalRef) {
    // Already has a Graph payout — don't double-fire.
    return {
      ok: true,
      skipped: true,
      payoutId: withdrawal.externalRef,
    };
  }

  // For now we only know how to auto-fire on the graph rail.
  if (withdrawal.provider && withdrawal.provider !== 'graph') {
    return { ok: false, skipped: true, error: `Provider ${withdrawal.provider} is not auto-payable yet` };
  }

  const userId = withdrawal.transaction.initiatorUserId;
  if (!userId) return { ok: false, error: 'Withdrawal transaction has no initiator' };

  const beneficiary = await prisma.beneficiary.findUnique({
    where: { id: withdrawal.beneficiaryId },
    select: { bankCode: true, accountNumber: true, accountName: true, type: true, isActive: true },
  });
  if (!beneficiary) return { ok: false, error: 'Beneficiary not found' };
  if (beneficiary.type !== 'bank_account') {
    return { ok: false, error: 'Beneficiary is not a bank account' };
  }
  if (!beneficiary.bankCode || !beneficiary.accountNumber) {
    return { ok: false, error: 'Beneficiary is missing bank_code or account_number' };
  }

  // Source: the user's Graph USD bank account — that's where payouts debit from.
  const sourceCurrency = withdrawal.transaction.currency; // e.g. 'USD'
  const source = await prisma.userExternalAccount.findFirst({
    where: {
      userId,
      provider: 'graph',
      currency: sourceCurrency,
      NOT: { status: 'closed' },
    },
    select: { externalAccountId: true },
  });
  if (!source) {
    return {
      ok: false,
      error: `User has no active Graph ${sourceCurrency} bank_account to debit from`,
    };
  }

  // 1. Create payout destination
  let destinationId: string;
  try {
    const destination: GraphPayoutDestinationNip = {
      source_type: 'bank_account',
      type: 'nip',
      account_id: source.externalAccountId,
      label: `withdrawal-${withdrawalId}`,
      bank_code: beneficiary.bankCode,
      account_number: beneficiary.accountNumber,
    };
    const res = await createGraphPayoutDestination(destination, {
      idempotencyKey: `pd-${withdrawalId}`,
    });
    destinationId = res.destinationId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ withdrawalId, err: msg }, 'Graph payout-destination failed');
    return { ok: false, error: `Payout destination failed: ${msg}` };
  }

  // 2. Create payout
  try {
    const description = `FrenzPay NGN withdrawal ${withdrawalId.slice(0, 8)}`;
    const amount = Number(withdrawal.sourceAmountCents); // subunits
    const payout = await createGraphPayout(
      { destination_id: destinationId, amount, description },
      { idempotencyKey: `po-${withdrawalId}` },
    );

    await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: {
        externalRef: payout.payoutId,
        provider: 'graph',
      },
    });

    logger.info(
      {
        withdrawalId,
        destinationId,
        payoutId: payout.payoutId,
        amountSubunits: amount,
        currency: sourceCurrency,
      },
      'Graph payout initiated',
    );
    return { ok: true, payoutId: payout.payoutId, destinationId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ withdrawalId, destinationId, err: msg }, 'Graph payout creation failed');
    return {
      ok: false,
      destinationId,
      error: `Payout creation failed: ${msg}`,
    };
  }
}
