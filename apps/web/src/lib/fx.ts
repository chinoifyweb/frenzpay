/**
 * Lightweight FX-rate helper.
 *
 * Production will fetch live rates from a dedicated FX provider (Checkout.com,
 * Chainlink, etc.) and cache them in Redis with a short TTL. For Phase 6 the
 * rate is read from environment variables with sensible defaults so the
 * NGN-withdrawal flow works end-to-end in local dev.
 *
 * All rates are stored as `rate × 1_000_000` (micro-units) to avoid float math.
 */

export type FxCurrency = 'USD' | 'USDC' | 'NGN';

/** rate × 1e6 for "1 from = X to" */
export function getFxRateMicro(from: FxCurrency, to: FxCurrency): bigint {
  if (from === to) return 1_000_000n;

  // Environment overrides (micro-units — so for 1 USD = 1600 NGN, set 1600000000)
  const envKey = `FX_RATE_${from}_${to}_MICRO`;
  const envVal = process.env[envKey];
  if (envVal) {
    try { return BigInt(envVal); } catch { /* fall through */ }
  }

  // Sensible dev defaults (reasonable 2026-era rates)
  const DEFAULTS: Record<string, bigint> = {
    'USD->NGN':  1600_000_000n,       // 1 USD = 1600 NGN
    'USDC->NGN': 1600_000_000n,       // 1 USDC ~= 1 USD
    'NGN->USD':       625n,           // 1 NGN ≈ 0.000625 USD  (= 1/1600 × 1e6)
    'NGN->USDC':      625n,
    'USD->USDC': 1_000_000n,
    'USDC->USD': 1_000_000n,
  };

  const key = `${from}->${to}` as const;
  const rate = DEFAULTS[key];
  if (!rate) throw new Error(`No FX rate configured for ${from}->${to}`);
  return rate;
}

/** Default FX markup in basis points (150 = 1.5%). */
export function getFxMarkupBps(): number {
  const envVal = process.env['FX_MARKUP_BPS'];
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 10_000) return parsed;
  }
  return 150;
}

/**
 * Convert an amount in one currency's minor units to another, applying an FX markup.
 *
 * Example: $100.00 USD → NGN at rate 1600 with 1.5% markup:
 *   sourceMinor = 10000 (cents)
 *   rate = 1_600_000_000n (micro)
 *   markupBps = 150
 *   → rate after markup = 1_600_000_000 × (10_000 - 150) / 10_000 = 1_576_000_000
 *   → destMinor = 10000 × 1_576_000_000 / 1_000_000 = 15_760_000 kobo = ₦157,600.00
 *
 * NB: Markup subtracts from the rate when converting source → destination
 * (user receives less than the mid-market would imply — that difference is
 * the platform's FX margin).
 */
export function convertMinor(params: {
  sourceAmountMinor: bigint;
  from: FxCurrency;
  to: FxCurrency;
  markupBps?: number;
}): { destAmountMinor: bigint; rateMicroAfterMarkup: bigint; markupBps: number } {
  const markupBps = params.markupBps ?? getFxMarkupBps();
  const rateMicro = getFxRateMicro(params.from, params.to);

  const markedDownRate = (rateMicro * BigInt(10_000 - markupBps)) / 10_000n;

  // destMinor = sourceMinor × markedDownRate / 1e6
  // Caveat: minor-unit precision differs between currencies (USD: 2, USDC: 6, NGN: 2).
  // Our defaults assume same-level minor scales (cents/kobo); USDC conversion needs a
  // decimals adjustment handled by callers.
  const destAmountMinor = (params.sourceAmountMinor * markedDownRate) / 1_000_000n;

  return { destAmountMinor, rateMicroAfterMarkup: markedDownRate, markupBps };
}

/** Platform withdrawal fee in source minor units. */
export function getWithdrawalFeeMinor(sourceCurrency: FxCurrency): bigint {
  const envKey = `WITHDRAWAL_FEE_${sourceCurrency}_MINOR`;
  const envVal = process.env[envKey];
  if (envVal) { try { return BigInt(envVal); } catch { /* fall through */ } }
  // Default: $2 flat fee in source currency minor units
  if (sourceCurrency === 'USD' || sourceCurrency === 'USDC') return 200n;
  if (sourceCurrency === 'NGN') return 50_000n; // ~₦500
  return 0n;
}
