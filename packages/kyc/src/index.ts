/**
 * @frenzpay/kyc — KYC tier logic, FrenzTag validation, ID format helpers.
 *
 * Non-negotiables:
 * - KYC tier advances are irreversible but may skip intermediate tiers in
 *   the current internal-review model: T0 -> T2 in one step after a
 *   successful manual review of ID + selfie + liveness + purpose + source
 *   of funds. No automatic BVN / NIN verification.
 * - PII fields never pass through this package — only format checks and
 *   plain-value regex.
 * - All status transitions must generate an AuditLog entry (done at the
 *   route level).
 * - FrenzTag format: /^[a-z][a-z0-9]{5,7}$/ (6-8 chars, starts with letter).
 */

// ─── Tier labels & descriptions ───────────────────────────────────────────────

export const KYC_TIERS = ['T0', 'T1', 'T2', 'T3'] as const;
export type KycTierValue = (typeof KYC_TIERS)[number];

export const KYC_TIER_LABELS: Record<KycTierValue, string> = {
  T0: 'Basic',
  T1: 'Verified',
  T2: 'Advanced',
  T3: 'Premium',
};

export const KYC_TIER_DESCRIPTIONS: Record<KycTierValue, string> = {
  T0: 'Signup verified (email)',
  T1: 'Reserved — not used by the internal KYC flow',
  T2: 'Government ID + selfie + liveness, manually reviewed within 24h',
  T3: 'Enhanced due diligence (high-value accounts)',
};

/**
 * Daily limits per tier (in USD cents for USD accounts).
 * These are defaults; individual users can have TierLimitOverride records.
 */
export const KYC_TIER_LIMITS: Record<
  KycTierValue,
  {
    depositDailyCents: bigint;
    withdrawDailyCents: bigint;
    balanceCapCents: bigint;
    p2pSendDailyCents: bigint;
    p2pReceiveDailyCents: bigint;
  }
> = {
  T0: {
    depositDailyCents: 0n,                 // cannot deposit until T1
    withdrawDailyCents: 0n,
    balanceCapCents: 0n,
    p2pSendDailyCents: 0n,
    p2pReceiveDailyCents: 0n,
  },
  T1: {
    depositDailyCents: 50_000n,            // $500/day
    withdrawDailyCents: 50_000n,
    balanceCapCents: 100_000n,             // $1,000 balance cap
    p2pSendDailyCents: 20_000n,
    p2pReceiveDailyCents: 50_000n,
  },
  T2: {
    depositDailyCents: 500_000n,           // $5,000/day
    withdrawDailyCents: 500_000n,
    balanceCapCents: 2_000_000n,           // $20,000 balance cap
    p2pSendDailyCents: 200_000n,
    p2pReceiveDailyCents: 500_000n,
  },
  T3: {
    depositDailyCents: 5_000_000n,         // $50,000/day
    withdrawDailyCents: 5_000_000n,
    balanceCapCents: 50_000_000n,          // $500,000 balance cap
    p2pSendDailyCents: 2_000_000n,
    p2pReceiveDailyCents: 5_000_000n,
  },
};

// ─── FrenzTag ─────────────────────────────────────────────────────────────────

/** Words that cannot be used as a FrenzTag regardless of availability. */
export const FRENZ_TAG_RESERVED = new Set([
  'admin', 'frenz', 'frenzpay', 'support', 'help', 'system', 'official',
  'security', 'billing', 'payment', 'finance', 'bank', 'wallet', 'money',
  'staff', 'team', 'info', 'contact', 'account', 'service', 'transfer',
  'payouts', 'withdraw', 'deposit', 'refund', 'cancel', 'delete', 'update',
  'signup', 'login', 'logout', 'verify', 'confirm', 'activate', 'reset',
  'password', 'recover', 'restore', 'suspend', 'freeze', 'block', 'unblock',
]);

/** Maximum number of times a user may change their FrenzTag per year. */
export const FRENZ_TAG_CHANGE_LIMIT_PER_YEAR = 1;

/** Quarantine period after a FrenzTag is released (old tag cannot be claimed). */
export const FRENZ_TAG_QUARANTINE_DAYS = 30;

/** Validate a FrenzTag string (purely format + reserved-word check). */
export function validateFrenzTag(tag: string): { valid: boolean; error?: string } {
  const normalised = tag.toLowerCase().trim();

  if (!/^[a-z][a-z0-9]{5,7}$/.test(normalised)) {
    return {
      valid: false,
      error: 'FrenzTag must be 6–8 characters, start with a letter, and contain only a–z and 0–9.',
    };
  }
  if (FRENZ_TAG_RESERVED.has(normalised)) {
    return { valid: false, error: 'That FrenzTag is reserved and cannot be claimed.' };
  }
  return { valid: true };
}

// ─── BVN / NIN format validators ──────────────────────────────────────────────

/**
 * Nigerian BVN: exactly 11 digits.
 * NB: No checksum algorithm is publicly documented; length check is all we do client-side.
 */
export function isValidBvnFormat(bvn: string): boolean {
  return /^\d{11}$/.test(bvn.trim());
}

/**
 * Nigerian NIN: exactly 11 digits.
 */
export function isValidNinFormat(nin: string): boolean {
  return /^\d{11}$/.test(nin.trim());
}

/**
 * Nigerian passport number format: A12345678 or B1234567 — letter + 7–8 digits.
 */
export function isValidPassportFormat(passport: string): boolean {
  return /^[A-Za-z]\d{7,8}$/.test(passport.trim());
}

// ─── KYC requirements per tier ────────────────────────────────────────────────

export interface KycSubmissionPayload {
  /** One of the ID types we currently accept in the internal review flow */
  docType: 'nin' | 'passport' | 'drivers_license';
  /** Raw document number — encrypted by route layer before persisting */
  docNumber: string;
  /** Full legal name as printed on the ID (encrypted by route layer) */
  fullLegalName: string;
  /** What the customer plans to use the account for */
  purposeOfAccount:
    | 'personal' | 'business' | 'freelance' | 'ecommerce' | 'investment'
    | 'remittance' | 'other';
  /** Where the customer's money comes from */
  sourceOfFunds:
    | 'salary' | 'business' | 'freelance' | 'investments' | 'gift'
    | 'savings' | 'other';
  /** Storage keys populated by the route after S3 upload */
  idFrontStorageKey: string;
  idBackStorageKey?: string;
  selfieStorageKey: string;
  /** Liveness proof — short video OR series-of-poses photo */
  livenessStorageKey: string;
  livenessMimeType: string;
}

export interface KycT3Payload {
  /** Supabase Storage key for proof-of-address document */
  proofOfAddressStorageKey: string;
  /** Document description e.g. "Utility bill March 2026" */
  docDescription: string;
}

// ─── Utility: check if user can advance to a tier ────────────────────────────

/**
 * Check whether a user may submit KYC for a given target tier.
 *
 * The internal KYC model lets a T0 user submit directly for T2 (one-shot
 * manual review). T3 enhanced DD still requires being T2 first.
 */
export function canSubmitForTier(
  currentTier: KycTierValue,
  targetTier: KycTierValue,
): { allowed: boolean; reason?: string } {
  const tierIndex: Record<KycTierValue, number> = { T0: 0, T1: 1, T2: 2, T3: 3 };
  const current = tierIndex[currentTier];
  const target = tierIndex[targetTier];

  if (target <= current) {
    return { allowed: false, reason: `Already at ${KYC_TIER_LABELS[currentTier]} or higher.` };
  }
  // T0 -> T2 is allowed (skips T1) under the internal single-step review.
  // Any skip > 1 tier beyond that (e.g. T0 -> T3) still needs T2 first.
  if (targetTier === 'T3' && currentTier !== 'T2') {
    return { allowed: false, reason: `T3 requires completing T2 first.` };
  }
  return { allowed: true };
}

// ─── Exported types ───────────────────────────────────────────────────────────

export interface KycStatusResponse {
  tier: KycTierValue;
  kycStatus: string;
  frenzTag: string | null;
  frenzTagVerified: boolean;
  pendingSubmission: {
    id: string;
    tier: KycTierValue;
    status: string;
    submittedAt: string;
  } | null;
  limits: (typeof KYC_TIER_LIMITS)[KycTierValue];
}
