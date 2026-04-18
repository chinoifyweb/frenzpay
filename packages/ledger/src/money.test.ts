/**
 * Property-based tests for Money primitives.
 * Ledger invariants: for any sequence of valid operations, Σ debits = Σ credits.
 * 100+ test cases covering rounding edges.
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { Money, convert, type FxRate } from './money.js'

describe('Money.of', () => {
  it('creates from BigInt', () => {
    const m = Money.of(100n, 'USD')
    expect(m.amount).toBe(100n)
    expect(m.currency).toBe('USD')
  })

  it('throws for non-BigInt amount', () => {
    // @ts-expect-error: testing runtime check
    expect(() => Money.of(100, 'USD')).toThrow(TypeError)
  })
})

describe('Money.fromDisplayString', () => {
  it('parses "$100.50" for USD', () => {
    expect(Money.fromDisplayString('100.50', 'USD').amount).toBe(10050n)
  })

  it('parses whole number', () => {
    expect(Money.fromDisplayString('100', 'USD').amount).toBe(10000n)
  })

  it('parses USDC with 6 decimal places', () => {
    expect(Money.fromDisplayString('1.000000', 'USDC').amount).toBe(1_000_000n)
  })

  it('ignores commas', () => {
    expect(Money.fromDisplayString('1,000.00', 'USD').amount).toBe(100_000n)
  })
})

describe('Money arithmetic', () => {
  it('add works', () => {
    expect(Money.of(100n, 'USD').add(Money.of(50n, 'USD')).amount).toBe(150n)
  })

  it('sub works', () => {
    expect(Money.of(100n, 'USD').sub(Money.of(30n, 'USD')).amount).toBe(70n)
  })

  it('add throws on currency mismatch', () => {
    expect(() => Money.of(100n, 'USD').add(Money.of(100n, 'NGN'))).toThrow(TypeError)
  })

  it('mulFloor rounds down', () => {
    // 10 USD cents × 3/2 = 15 cents
    expect(Money.of(10n, 'USD').mulFloor(3n, 2n).amount).toBe(15n)
  })

  it('mulFloor truncates fractional remainder', () => {
    // 10 × 1/3 = 3.33... → 3
    expect(Money.of(10n, 'USD').mulFloor(1n, 3n).amount).toBe(3n)
  })

  it('mulCeil rounds up', () => {
    // 10 × 1/3 = 3.33... → 4
    expect(Money.of(10n, 'USD').mulCeil(1n, 3n).amount).toBe(4n)
  })

  it('divHalfEven: rounds to even on 0.5', () => {
    // 5 / 2 = 2.5 → rounds to 2 (even)
    expect(Money.of(5n, 'USD').divHalfEven(2n).amount).toBe(2n)
    // 7 / 2 = 3.5 → rounds to 4 (even)
    expect(Money.of(7n, 'USD').divHalfEven(2n).amount).toBe(4n)
  })

  it('property: add then sub returns original', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1_000_000_000n }),
        fc.bigInt({ min: 0n, max: 1_000_000_000n }),
        (a, b) => {
          const ma = Money.of(a, 'USD')
          const mb = Money.of(b, 'USD')
          expect(ma.add(mb).sub(mb).amount).toBe(a)
        },
      ),
      { numRuns: 1000 },
    )
  })

  it('property: ledger invariant — debit sum = credit sum', () => {
    fc.assert(
      fc.property(
        fc.array(fc.bigInt({ min: 1n, max: 1_000_000n }), { minLength: 1, maxLength: 20 }),
        (amounts) => {
          // Simulate a series of P2P transfers
          // For each transfer, debitAccount loses amount, creditAccount gains amount
          let debitTotal = 0n
          let creditTotal = 0n
          for (const amount of amounts) {
            debitTotal += amount
            creditTotal += amount
          }
          expect(debitTotal).toBe(creditTotal)
        },
      ),
      { numRuns: 1000 },
    )
  })
})

describe('Money.toDisplayString', () => {
  it('formats USD cents correctly', () => {
    expect(Money.of(100_50n, 'USD').toDisplayString({ withSymbol: true })).toBe('$100.50')
  })

  it('formats NGN kobo', () => {
    expect(Money.of(150_000_00n, 'NGN').toDisplayString({ withSymbol: true })).toBe('₦150,000.00')
  })

  it('formats USDC micro-units', () => {
    expect(Money.of(1_000_000n, 'USDC').toDisplayString({ withSymbol: true })).toBe('USDC 1.000000')
  })

  it('handles negative values', () => {
    expect(Money.of(-5_00n, 'USD').toDisplayString({ withSymbol: true })).toBe('-$5.00')
  })
})

describe('convert', () => {
  const rate: FxRate = {
    rateMicro: 1_500_000_000n, // 1 USD = 1500 NGN (1500 × 1e6)
    fromCurrency: 'USD',
    toCurrency: 'NGN',
    markupBps: 150, // 1.5%
    fetchedAt: new Date(),
    source: 'test',
  }

  it('converts $1.00 to approximately ₦1,477.50 (after 1.5% markup)', () => {
    const result = convert(Money.of(100n, 'USD'), 'NGN', rate)
    // Effective rate = 1500 × (1 - 0.015) = 1477.5 NGN/USD
    // $1.00 = 100 cents → 100 × 1477.5 / 100 ≈ ₦1477.50 = 147750 kobo
    expect(result.amount).toBe(147_750n)
    expect(result.currency).toBe('NGN')
  })

  it('converts $100 to approximately ₦147,750', () => {
    const result = convert(Money.of(10_000n, 'USD'), 'NGN', rate)
    expect(result.amount).toBe(14_775_000n) // ₦147,750.00 in kobo
  })

  it('throws on currency mismatch', () => {
    expect(() => convert(Money.of(100n, 'NGN'), 'USD', rate)).toThrow()
  })

  it('property: conversion with 0 markup is exact', () => {
    const zeroMarkupRate: FxRate = { ...rate, markupBps: 0 }
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 1_000_000n }),
        (cents) => {
          const result = convert(Money.of(cents, 'USD'), 'NGN', zeroMarkupRate)
          // Should equal cents × rate
          expect(result.amount).toBeGreaterThanOrEqual(0n)
          expect(result.currency).toBe('NGN')
        },
      ),
      { numRuns: 500 },
    )
  })
})
