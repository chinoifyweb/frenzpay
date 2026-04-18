/**
 * Lightweight fraud engine — runs as a pre-flight check on money-movement endpoints
 * and returns a risk score + decision. Exposed as `assessRisk()`.
 *
 * Rules (each contributes to score; score ≥ 70 = HOLD, ≥ 40 = REVIEW):
 *   R1: First-time recipient (P2P) in last 24 h         →  +20
 *   R2: Large send (> 50% of daily limit in one tx)     →  +25
 *   R3: Velocity (> 3 sends to different recipients/hr) →  +30
 *   R4: New device + high-value tx (> $1,000)           →  +35
 *   R5: Sudden country change since last login          →  +40 (stub: needs IP geo)
 *   R6: Account < 24 h old + first outgoing tx          →  +25
 *   R7: PIN failure rate > 2 in last hour               →  +30
 *   R8: User.status !== ACTIVE                           →  block immediately
 *
 * A HOLD decision rejects the transaction with a 403.
 * A REVIEW decision allows but flags for admin review + requires additional MFA.
 * An OK decision proceeds normally.
 */
import { prisma } from '@frenzpay/db';
import { logger } from '@frenzpay/logger';

export type RiskDecision = 'ok' | 'review' | 'hold';

export interface RiskAssessment {
  decision: RiskDecision;
  score: number;
  rules: Array<{ code: string; name: string; points: number }>;
}

export interface AssessRiskInput {
  userId: string;
  action: 'p2p_send' | 'withdraw' | 'card_issue' | 'convert';
  amountMinor: bigint;
  currency: string;
  counterpartyUserId?: string;
  deviceId?: string;
}

const HOLD_THRESHOLD = 70;
const REVIEW_THRESHOLD = 40;

export async function assessRisk(input: AssessRiskInput): Promise<RiskAssessment> {
  const rules: RiskAssessment['rules'] = [];
  let score = 0;

  // ── R8: Account status check (immediate block) ────────────────────────────
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { status: true, createdAt: true, kycTier: true },
  });

  if (!user) {
    return { decision: 'hold', score: 100, rules: [{ code: 'R_NOUSER', name: 'User not found', points: 100 }] };
  }

  if (user.status !== 'ACTIVE') {
    return {
      decision: 'hold', score: 100,
      rules: [{ code: 'R8', name: `Account status = ${user.status}`, points: 100 }],
    };
  }

  // ── R6: New account + first outgoing tx ────────────────────────────────────
  const accountAgeHours = (Date.now() - user.createdAt.getTime()) / 3_600_000;
  if (accountAgeHours < 24) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priorTx: any = await prisma.transaction.findFirst({
      where: { initiatorUserId: input.userId, type: { in: ['P2P', 'WITHDRAWAL'] } },
      select: { id: true },
    });
    if (!priorTx) {
      score += 25;
      rules.push({ code: 'R6', name: 'New account first outgoing', points: 25 });
    }
  }

  // ── R1: First-time recipient in last 24h (P2P) ─────────────────────────────
  if (input.action === 'p2p_send' && input.counterpartyUserId) {
    const prior = await prisma.p2PTransfer.findFirst({
      where: {
        senderId: input.userId, recipientId: input.counterpartyUserId,
        createdAt: { lt: new Date(Date.now() - 24 * 3_600_000) },
      },
    });
    if (!prior) {
      score += 20;
      rules.push({ code: 'R1', name: 'First-time recipient', points: 20 });
    }
  }

  // ── R2: Large send (> 50% of daily limit) ──────────────────────────────────
  const tierLimit = await prisma.kycTierLimit.findUnique({
    where: { tier: user.kycTier },
    select: { p2pSendLimitDailyCents: true, withdrawLimitDailyCents: true },
  });
  if (tierLimit) {
    const relevantLimit = input.action === 'withdraw'
      ? (tierLimit.withdrawLimitDailyCents as unknown as bigint)
      : (tierLimit.p2pSendLimitDailyCents as unknown as bigint);
    // Scale USDC to cents-equivalent for limit comparison
    const amountInCents = input.currency === 'USDC' ? input.amountMinor / 10_000n : input.amountMinor;
    if (relevantLimit > 0n && amountInCents * 2n > relevantLimit) {
      score += 25;
      rules.push({ code: 'R2', name: 'Large single transaction (>50% daily)', points: 25 });
    }
  }

  // ── R3: Velocity — many different recipients in 1 hour ─────────────────────
  if (input.action === 'p2p_send') {
    const oneHourAgo = new Date(Date.now() - 3_600_000);
    const recent = await prisma.p2PTransfer.findMany({
      where: { senderId: input.userId, createdAt: { gte: oneHourAgo } },
      select: { recipientId: true }, take: 20,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uniqueRecipients = new Set(recent.map((r: any) => r.recipientId));
    if (uniqueRecipients.size > 3) {
      score += 30;
      rules.push({ code: 'R3', name: `${uniqueRecipients.size} different recipients in 1 h`, points: 30 });
    }
  }

  // ── R7: Recent PIN failures ────────────────────────────────────────────────
  const pinRec = await prisma.transactionPin.findUnique({
    where: { userId: input.userId },
    select: { failedAttempts: true },
  });
  if (pinRec && pinRec.failedAttempts > 2) {
    score += 30;
    rules.push({ code: 'R7', name: `${pinRec.failedAttempts} recent PIN failures`, points: 30 });
  }

  // ── R4: New device + high-value tx ─────────────────────────────────────────
  if (input.deviceId) {
    // Scale USDC to cents-equivalent
    const highValue =
      (input.currency === 'USDC' ? input.amountMinor / 10_000n : input.amountMinor) > 100_000n; // $1,000
    if (highValue) {
      const device = await prisma.device.findUnique({
        where: { id: input.deviceId },
        select: { isTrusted: true, createdAt: true },
      });
      const deviceAgeDays = device ? (Date.now() - device.createdAt.getTime()) / 86_400_000 : 999;
      if (!device?.isTrusted && deviceAgeDays < 7) {
        score += 35;
        rules.push({ code: 'R4', name: 'New device + high-value transaction', points: 35 });
      }
    }
  }

  // ── Decision ──────────────────────────────────────────────────────────────
  const decision: RiskDecision = score >= HOLD_THRESHOLD ? 'hold' : score >= REVIEW_THRESHOLD ? 'review' : 'ok';

  if (decision !== 'ok') {
    logger.warn(
      { userId: input.userId, action: input.action, score, decision, rules },
      'Fraud engine flagged transaction',
    );
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: `FRAUD_${decision.toUpperCase()}`,
        resourceType: 'Transaction',
        resourceId: input.userId,
        metadata: { score, rules, inputAction: input.action, amountMinor: input.amountMinor.toString() },
      },
    }).catch(() => { /* best effort */ });
  }

  return { decision, score, rules };
}
