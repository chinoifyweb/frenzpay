/**
 * Double-entry ledger — core posting primitive.
 *
 * Non-negotiables:
 * - Every money movement creates matching LedgerEntry rows (debit = credit per currency)
 * - Entire operation is atomic inside a Prisma transaction
 * - Idempotency: duplicate idempotency keys return the original result
 * - No balance column is ever mutated — balances derived from SUM(entries)
 */

import type { PrismaClientInstance as PrismaClient, TransactionType } from '@frenzpay/db'
import { logger } from '@frenzpay/logger'
import type { Money } from './money'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LedgerLine {
  /** Account to debit (funds flow out of this account) */
  debitAccountId: string
  /** Account to credit (funds flow into this account) */
  creditAccountId: string
  amount: Money
}

export interface TransactionInput {
  type: TransactionType
  idempotencyKey: string
  lines: LedgerLine[]
  initiatorUserId?: string
  counterpartyUserId?: string
  externalRef?: string
  feeAmount?: Money
  metadata?: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────────────────
// Balance derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive the balance of an account from the ledger.
 * Balance = SUM(credits) - SUM(debits)
 *
 * For asset accounts (user wallets), credit = inflow, debit = outflow.
 * For system liability accounts, debit = decreasing the omnibus.
 */
export async function balanceOf(prisma: PrismaClient, accountId: string): Promise<bigint> {
  const [credits, debits] = await Promise.all([
    prisma.ledgerEntry.aggregate({
      where: { creditAccountId: accountId },
      _sum: { amount: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { debitAccountId: accountId },
      _sum: { amount: true },
    }),
  ])

  const creditSum: bigint = (credits._sum.amount as bigint | null) ?? 0n
  const debitSum: bigint = (debits._sum.amount as bigint | null) ?? 0n
  return creditSum - debitSum
}

/**
 * Get a user's available balance for a specific currency.
 */
export async function availableBalanceOf(
  prisma: PrismaClient,
  userId: string,
  currency: string,
): Promise<bigint> {
  const account = await prisma.account.findFirst({
    where: { ownerId: userId, currency, subtype: 'AVAILABLE' },
  })
  if (!account) return 0n
  return balanceOf(prisma, account.id)
}

/**
 * Get or create a user's account for a given currency + subtype.
 */
export async function ensureAccount(
  prisma: PrismaClient,
  userId: string,
  currency: string,
  subtype: 'AVAILABLE' | 'PENDING' | 'HOLD' | 'RESERVED' | 'LOCKED',
): Promise<string> {
  const existing = await prisma.account.findFirst({
    where: { ownerId: userId, currency, subtype },
  })
  if (existing) return existing.id

  const created = await prisma.account.create({
    data: { ownerType: 'USER', ownerId: userId, currency, subtype },
  })
  return created.id
}

/**
 * List all of a user's accounts with their live balances.
 */
export async function listUserAccounts(
  prisma: PrismaClient,
  userId: string,
): Promise<Array<{ id: string; currency: string; subtype: string; balance: bigint }>> {
  const accounts = await prisma.account.findMany({
    where: { ownerType: 'USER', ownerId: userId },
    select: { id: true, currency: true, subtype: true },
  })

  return await Promise.all(
    accounts.map(async (acc: { id: string; currency: string; subtype: string }) => ({
      ...acc,
      balance: await balanceOf(prisma, acc.id),
    })),
  )
}

/**
 * Provision a user's baseline AVAILABLE accounts for the given currencies.
 * Returns the account IDs keyed by currency.
 */
export async function provisionUserAccounts(
  prisma: PrismaClient,
  userId: string,
  currencies: string[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const currency of currencies) {
    result[currency] = await ensureAccount(prisma, userId, currency, 'AVAILABLE')
  }
  return result
}

/**
 * Get a system account by name. Throws if not found.
 */
export async function getSystemAccount(prisma: PrismaClient, name: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { ownerType: 'SYSTEM', name },
  })
  if (!account) {
    throw new Error(
      `System account "${name}" not found. Did you run the seed script?`,
    )
  }
  return account.id
}

// ─────────────────────────────────────────────────────────────────────────────
// Core posting function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Post a transaction atomically.
 * Validates that total debits = total credits per currency (balanced).
 * Idempotent: if idempotencyKey exists, returns the existing transaction.
 */
export async function postTransaction(
  prisma: PrismaClient,
  input: TransactionInput,
): Promise<{ id: string; status: string }> {
  // ── Idempotency check ──────────────────────────────────────────────────────
  const existing = await prisma.transaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true, status: true },
  })
  if (existing) {
    logger.info(
      { idempotencyKey: input.idempotencyKey, transactionId: existing.id },
      'Duplicate transaction request — returning existing',
    )
    return existing
  }

  // ── Validate balance ───────────────────────────────────────────────────────
  // Sum debits and credits per currency; they must be equal
  const debits = new Map<string, bigint>()
  const credits = new Map<string, bigint>()

  for (const line of input.lines) {
    const currency = line.amount.currency
    debits.set(currency, (debits.get(currency) ?? 0n) + line.amount.amount)
    credits.set(currency, (credits.get(currency) ?? 0n) + line.amount.amount)
  }

  // Each line contributes one debit and one credit of the same amount,
  // so they will always be balanced. This assertion documents the invariant.
  for (const [currency, debitSum] of debits) {
    const creditSum = credits.get(currency) ?? 0n
    if (debitSum !== creditSum) {
      throw new Error(
        `Ledger imbalance for ${currency}: debits=${debitSum} credits=${creditSum}`,
      )
    }
  }

  // ── Atomic post ────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (prisma as PrismaClient).$transaction(async (tx: any) => {
    const transaction = await tx.transaction.create({
      data: {
        type: input.type,
        status: 'POSTED',
        idempotencyKey: input.idempotencyKey,
        initiatorUserId: input.initiatorUserId ?? null,
        counterpartyUserId: input.counterpartyUserId ?? null,
        externalRef: input.externalRef ?? null,
        // Use first line's amount as the canonical transaction amount
        amount: input.lines[0]?.amount.amount ?? 0n,
        currency: input.lines[0]?.amount.currency ?? 'USD',
        feeAmount: input.feeAmount?.amount ?? 0n,
        feeCurrency: input.feeAmount?.currency ?? null,
        metadata: input.metadata ?? null,
        postedAt: new Date(),
      },
    })

    await tx.ledgerEntry.createMany({
      data: input.lines.map((line) => ({
        transactionId: transaction.id,
        debitAccountId: line.debitAccountId,
        creditAccountId: line.creditAccountId,
        amount: line.amount.amount,
        currency: line.amount.currency,
      })),
    })

    logger.info(
      {
        transactionId: transaction.id,
        type: input.type,
        lines: input.lines.length,
      },
      'Transaction posted',
    )

    return { id: transaction.id, status: transaction.status }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Hold / Release / Capture (for card authorizations)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hold funds: move from AVAILABLE to HOLD account.
 */
export async function hold(
  prisma: PrismaClient,
  userId: string,
  amount: Money,
  idempotencyKey: string,
): Promise<{ transactionId: string }> {
  const availableAccountId = await ensureAccount(prisma, userId, amount.currency, 'AVAILABLE')
  const holdAccountId = await ensureAccount(prisma, userId, amount.currency, 'HOLD')

  const tx = await postTransaction(prisma, {
    type: 'CARD_AUTH',
    idempotencyKey,
    lines: [{ debitAccountId: availableAccountId, creditAccountId: holdAccountId, amount }],
    initiatorUserId: userId,
  })
  return { transactionId: tx.id }
}

/**
 * Release a hold: move funds back from HOLD to AVAILABLE.
 */
export async function release(
  prisma: PrismaClient,
  userId: string,
  amount: Money,
  idempotencyKey: string,
): Promise<{ transactionId: string }> {
  const availableAccountId = await ensureAccount(prisma, userId, amount.currency, 'AVAILABLE')
  const holdAccountId = await ensureAccount(prisma, userId, amount.currency, 'HOLD')

  const tx = await postTransaction(prisma, {
    type: 'CARD_REVERSAL',
    idempotencyKey,
    lines: [{ debitAccountId: holdAccountId, creditAccountId: availableAccountId, amount }],
    initiatorUserId: userId,
  })
  return { transactionId: tx.id }
}
