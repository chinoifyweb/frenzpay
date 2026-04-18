/**
 * Money primitives — all amounts as BigInt in smallest currency unit.
 *
 * Non-negotiable: NEVER use JavaScript Number for money calculations.
 *
 * Currency precision:
 *   USD  = 2 decimal places (cents)
 *   NGN  = 2 decimal places (kobo)
 *   USDC = 6 decimal places (microUSDC, 1e6 per USDC)
 */

export type Currency = 'USD' | 'NGN' | 'USDC' | string

/** Precision (decimal places) for each known currency */
export const CURRENCY_PRECISION: Readonly<Record<string, number>> = {
  USD: 2,
  NGN: 2,
  USDC: 6,
  GBP: 2,
  EUR: 2,
}

/** Human-readable symbol */
export const CURRENCY_SYMBOL: Readonly<Record<string, string>> = {
  USD: '$',
  NGN: '₦',
  USDC: 'USDC ',
  GBP: '£',
  EUR: '€',
}

function precisionOf(currency: Currency): number {
  return CURRENCY_PRECISION[currency] ?? 2
}

// ─────────────────────────────────────────────────────────────────────────────
// Money class — immutable value object
// ─────────────────────────────────────────────────────────────────────────────

export class Money {
  readonly amount: bigint
  readonly currency: Currency

  private constructor(amount: bigint, currency: Currency) {
    if (typeof amount !== 'bigint') {
      throw new TypeError(`Money.amount must be BigInt, got ${typeof amount}`)
    }
    this.amount = amount
    this.currency = currency
  }

  // ── Constructors ────────────────────────────────────────────────────────────

  /** Create from smallest unit (e.g. cents, kobo) */
  static of(amount: bigint, currency: Currency): Money {
    return new Money(amount, currency)
  }

  /** Create from display string e.g. "100.50" for USD */
  static fromDisplayString(display: string, currency: Currency): Money {
    const precision = precisionOf(currency)
    const parts = display.replace(/,/g, '').split('.')
    const intPart = parts[0] ?? '0'
    const fracPart = (parts[1] ?? '').padEnd(precision, '0').slice(0, precision)
    const amount = BigInt(intPart) * 10n ** BigInt(precision) + BigInt(fracPart)
    return new Money(amount, currency)
  }

  /** Zero value for a currency */
  static zero(currency: Currency): Money {
    return new Money(0n, currency)
  }

  // ── Arithmetic ──────────────────────────────────────────────────────────────

  add(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this.amount + other.amount, this.currency)
  }

  sub(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this.amount - other.amount, this.currency)
  }

  /** Multiply by a rational number. Rounds toward negative infinity (floor). */
  mulFloor(numerator: bigint, denominator: bigint): Money {
    if (denominator === 0n) throw new RangeError('Money.mulFloor: denominator cannot be 0')
    const result = (this.amount * numerator) / denominator
    return new Money(result, this.currency)
  }

  /** Multiply by a rational number. Rounds toward positive infinity (ceil). */
  mulCeil(numerator: bigint, denominator: bigint): Money {
    if (denominator === 0n) throw new RangeError('Money.mulCeil: denominator cannot be 0')
    const product = this.amount * numerator
    // ceiling division: (a + b - 1) / b
    const result = (product + denominator - 1n) / denominator
    return new Money(result, this.currency)
  }

  /** Divide, rounding half-even (banker's rounding) */
  divHalfEven(divisor: bigint): Money {
    if (divisor === 0n) throw new RangeError('Money.divHalfEven: divisor cannot be 0')
    const quotient = this.amount / divisor
    const remainder = this.amount % divisor
    const half = divisor / 2n
    let rounded = quotient
    if (remainder > half) {
      rounded = quotient + 1n
    } else if (remainder === half) {
      // Banker's rounding: round to even
      if (quotient % 2n !== 0n) rounded = quotient + 1n
    }
    return new Money(rounded, this.currency)
  }

  negate(): Money {
    return new Money(-this.amount, this.currency)
  }

  abs(): Money {
    return new Money(this.amount < 0n ? -this.amount : this.amount, this.currency)
  }

  // ── Comparisons ──────────────────────────────────────────────────────────────

  isZero(): boolean {
    return this.amount === 0n
  }

  isPositive(): boolean {
    return this.amount > 0n
  }

  isNegative(): boolean {
    return this.amount < 0n
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other)
    return this.amount > other.amount
  }

  lessThan(other: Money): boolean {
    this.assertSameCurrency(other)
    return this.amount < other.amount
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency
  }

  // ── Display ──────────────────────────────────────────────────────────────────

  /**
   * Human-readable display string, e.g. "$1,234.56" or "₦50,000.00"
   */
  toDisplayString(options: { withSymbol?: boolean } = {}): string {
    const precision = precisionOf(this.currency)
    const factor = 10n ** BigInt(precision)
    const abs = this.amount < 0n ? -this.amount : this.amount
    const intPart = abs / factor
    const fracPart = abs % factor
    const fracStr = fracPart.toString().padStart(precision, '0')
    const intStr = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    const sign = this.amount < 0n ? '-' : ''
    const symbol = options.withSymbol ? (CURRENCY_SYMBOL[this.currency] ?? '') : ''
    return precision > 0
      ? `${sign}${symbol}${intStr}.${fracStr}`
      : `${sign}${symbol}${intStr}`
  }

  toJSON(): { amount: string; currency: Currency } {
    return { amount: this.amount.toString(), currency: this.currency }
  }

  toString(): string {
    return this.toDisplayString({ withSymbol: true })
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new TypeError(
        `Currency mismatch: cannot mix ${this.currency} and ${other.currency}`,
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FX conversion primitive
// ─────────────────────────────────────────────────────────────────────────────

export interface FxRate {
  /** Mid-market rate expressed as micro-units (rate × 1_000_000). E.g. USD/NGN 1500 → 1_500_000_000 */
  rateMicro: bigint
  fromCurrency: Currency
  toCurrency: Currency
  markupBps: number
  fetchedAt: Date
  source: string
}

/**
 * Convert a Money amount to another currency using the given FX rate.
 * Applies the markup. Rounds half-even.
 *
 * @example
 * // 1 USD = 1500 NGN, markup 150 bps (1.5%)
 * // rate = 1500.00 NGN/USD, after markup ≈ 1477.5 (customer gets less)
 * convert(Money.of(100_00n, 'USD'), 'NGN', rate) → ~₦147,750.00
 */
export function convert(from: Money, toCurrency: Currency, rate: FxRate): Money {
  if (from.currency !== rate.fromCurrency) {
    throw new TypeError(
      `FX rate is for ${rate.fromCurrency} → ${rate.toCurrency}, not ${from.currency}`,
    )
  }
  if (toCurrency !== rate.toCurrency) {
    throw new TypeError(`Expected toCurrency ${rate.toCurrency}, got ${toCurrency}`)
  }

  // Apply markup: effective rate = mid × (1 - markupBps/10000)
  // Working in integers: rateMicro × (10000 - markupBps) / 10000
  const MICRO = 1_000_000n
  const markupBps = BigInt(rate.markupBps)
  const effectiveRateMicro = (rate.rateMicro * (10_000n - markupBps)) / 10_000n

  const fromPrecision = BigInt(10n ** BigInt(precisionOf(from.currency)))
  const toPrecision = BigInt(10n ** BigInt(precisionOf(toCurrency)))

  // result = from.amount × effectiveRateMicro × toPrecision / (fromPrecision × MICRO)
  const numerator = from.amount * effectiveRateMicro * toPrecision
  const denominator = fromPrecision * MICRO

  // Banker's rounding: (a + b/2) / b, round to even on tie
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  const half = denominator / 2n
  let result = quotient
  if (remainder > half) {
    result = quotient + 1n
  } else if (remainder === half && quotient % 2n !== 0n) {
    result = quotient + 1n
  }

  return Money.of(result, toCurrency)
}
