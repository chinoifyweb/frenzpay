/**
 * Database seed — idempotent, safe to re-run.
 * Seeds: KycTierLimits, PlatformSettings, system Account rows
 */
import { PrismaClient, KycTier } from '../generated/client/index.js'

const prisma = new PrismaClient()

// All monetary amounts in smallest unit (cents / kobo)
const TIER_LIMITS: Array<{
  tier: KycTier
  depositLimitDailyCents: bigint
  withdrawLimitDailyCents: bigint
  balanceCapCents: bigint
  p2pSendLimitDailyCents: bigint
  p2pReceiveLimitDailyCents: bigint
}> = [
  {
    tier: KycTier.T0,
    depositLimitDailyCents: 0n,
    withdrawLimitDailyCents: 0n,
    balanceCapCents: 0n,
    p2pSendLimitDailyCents: 0n,
    p2pReceiveLimitDailyCents: 0n,
  },
  {
    tier: KycTier.T1,
    depositLimitDailyCents: 50_000n,    // $500
    withdrawLimitDailyCents: 0n,
    balanceCapCents: 50_000n,           // $500
    p2pSendLimitDailyCents: 0n,
    p2pReceiveLimitDailyCents: 10_000n, // $100
  },
  {
    tier: KycTier.T2,
    depositLimitDailyCents: 500_000n,    // $5,000
    withdrawLimitDailyCents: 200_000n,   // $2,000
    balanceCapCents: 1_000_000n,         // $10,000
    p2pSendLimitDailyCents: 200_000n,    // $2,000
    p2pReceiveLimitDailyCents: 200_000n, // $2,000
  },
  {
    tier: KycTier.T3,
    depositLimitDailyCents: 2_500_000n,   // $25,000
    withdrawLimitDailyCents: 1_000_000n,  // $10,000
    balanceCapCents: 5_000_000n,          // $50,000
    p2pSendLimitDailyCents: 1_000_000n,   // $10,000
    p2pReceiveLimitDailyCents: 1_000_000n,// $10,000
  },
]

const PLATFORM_SETTINGS = [
  { key: 'default_fx_markup_bps', value: 150, description: 'Default FX markup in basis points (150 = 1.5%)' },
  { key: 'withdrawal_fee_cents', value: 200, description: 'Flat withdrawal fee in USD cents ($2)' },
  { key: 'early_lock_break_fee_bps', value: 200, description: 'Savings lock early break fee in bps (200 = 2%)' },
  { key: 'p2p_fee_cents', value: 0, description: 'P2P transfer fee (internal, $0)' },
  { key: 'max_cards_per_user', value: 5, description: 'Maximum virtual cards per user' },
  { key: 'beneficiary_cooling_period_hours', value: 24, description: 'Hours new bank beneficiary must wait before first use (T2 users)' },
  { key: 'max_upload_size_mb', value: 10, description: 'Maximum KYC document upload size in MB' },
  { key: 'supported_audio_formats', value: ['mp3', 'm4a', 'aac'], description: 'Supported audio formats' },
  { key: 'signup_open', value: true, description: 'Whether public signup is open' },
  { key: 'maintenance_mode', value: false, description: 'Puts site into maintenance mode' },
]

// System accounts that must exist for the ledger to function
const SYSTEM_ACCOUNTS = [
  // Bank/custodian omnibus accounts
  { name: 'bridge_usd_omnibus', currency: 'USDC' },
  { name: 'flutterwave_ngn_float', currency: 'NGN' },
  { name: 'paystack_ngn_float', currency: 'NGN' },

  // Platform fee collection
  { name: 'fees_usd', currency: 'USD' },
  { name: 'fees_ngn', currency: 'NGN' },
  { name: 'fx_markup_usd', currency: 'USD' },

  // Suspense — unassigned incoming funds
  { name: 'suspense_usd', currency: 'USD' },
  { name: 'suspense_ngn', currency: 'NGN' },

  // Represents the "outside world" — balancing side of deposits/withdrawals
  { name: 'external_world_usd', currency: 'USD' },
  { name: 'external_world_ngn', currency: 'NGN' },
  { name: 'external_world_usdc', currency: 'USDC' },
]

async function main() {
  console.log('Seeding KYC tier limits...')
  for (const limit of TIER_LIMITS) {
    await prisma.kycTierLimit.upsert({
      where: { tier: limit.tier },
      create: limit,
      update: limit,
    })
  }

  console.log('Seeding platform settings...')
  for (const setting of PLATFORM_SETTINGS) {
    await prisma.platformSetting.upsert({
      where: { key: setting.key },
      create: { key: setting.key, value: setting.value, description: setting.description },
      update: { value: setting.value, description: setting.description },
    })
  }

  console.log('Seeding system accounts...')
  for (const acct of SYSTEM_ACCOUNTS) {
    await prisma.account.upsert({
      where: {
        user_currency_subtype: {
          ownerId: null as unknown as string,
          currency: acct.currency,
          subtype: 'AVAILABLE',
        },
      },
      create: {
        ownerType: 'SYSTEM',
        ownerId: null,
        currency: acct.currency,
        subtype: 'AVAILABLE',
        name: acct.name,
      },
      update: { name: acct.name },
    })
  }

  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
