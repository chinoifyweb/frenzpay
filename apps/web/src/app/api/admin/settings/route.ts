// Force dynamic — these routes read cookies/headers and must never be statically rendered.
export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/settings
 * PUT  /api/admin/settings
 *
 * Platform-wide configuration stored in the `platform_settings` key/value
 * table. Every write creates an admin_audit_logs entry so we can trace who
 * changed what and when.
 *
 * Whitelisted keys only — a rogue admin can't flip arbitrary JSON into the
 * table. If you want to add a new setting, extend SETTING_SCHEMAS below.
 *
 * PUT body: { updates: Record<keyName, newValue> }
 *   - Bulk-upserts many settings in one round trip.
 *   - Each value is validated against its Zod schema.
 *   - Unknown keys are rejected (422).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { logger } from '@frenzpay/logger';

// ── Whitelist of supported setting keys ────────────────────────────────────
//
// Each entry defines: the Zod schema (validates writes), a description
// (shown in audit logs), and a default (returned when no row exists yet).
//
// Values are JSONB — strings, numbers, booleans, arrays, objects all legal.

const SETTING_SCHEMAS = {
  // General
  platformName: {
    schema: z.string().min(1).max(120),
    description: 'Display name of the platform (header, emails)',
    default: 'FrenzPay',
  },
  supportEmail: {
    schema: z.string().email().max(320),
    description: 'Customer-facing support email',
    default: 'support@frenzpay.co',
  },
  announcement: {
    schema: z.string().max(2000),
    description: 'Banner text shown on all pages (empty = hidden)',
    default: '',
  },
  maintenanceMode: {
    schema: z.boolean(),
    description: 'When true, customer-facing pages render a maintenance screen',
    default: false,
  },

  // Fees + FX (NGN / Graph rail)
  withdrawalFeePercent: {
    schema: z.number().min(0).max(10),
    description: 'Percentage fee on every withdrawal (0..10)',
    default: 1.5,
  },
  withdrawalFeeFlatCents: {
    schema: z.number().int().min(0).max(100_000),
    description:
      'Flat per-withdrawal fee in USD cents (adds on top of the percentage fee). E.g. 150 = $1.50 per payout.',
    default: 0,
  },
  fxMarkupBps: {
    schema: z.number().int().min(0).max(1000),
    description:
      'FX markup in basis points (100 = 1%) applied to the USD\u2192NGN mid-market rate. Ignored when fxManualRateUsdNgn is set > 0.',
    default: 50,
  },
  fxManualRateUsdNgn: {
    schema: z.number().min(0).max(100_000),
    description:
      'Manual USD\u2192NGN rate override. 0 = fetch Graph live rate + apply fxMarkupBps. Any positive value bypasses Graph and uses this rate as the effective rate (no markup added on top).',
    default: 0,
  },
  minWithdrawalUsd: {
    schema: z.number().min(0).max(100_000),
    description: 'Minimum withdrawal amount in USD',
    default: 10,
  },
  monthlyMaintenanceFeeUsdCents: {
    schema: z.number().int().min(0).max(100_000),
    description:
      'Monthly account-maintenance fee in USD cents. 0 = disabled. Charged automatically by the cron worker on the 1st of each month to every active KYC-T2+ user with sufficient balance. Skipped if balance < fee.',
    default: 0,
  },

  // Card fees \u2014 layered on top of whatever Graph charges us. We collect from
  // the customer; ops reconciles against Graph's invoice in fees_usd at end of
  // month.
  cardCreationFeeUsdCents: {
    schema: z.number().int().min(0).max(50_000),
    description:
      'One-time fee charged to the customer when they issue a virtual USD card. USD cents. 0 = free. Debited from user.USD.AVAILABLE at issuance; the issuance fails if balance is insufficient.',
    default: 0,
  },
  cardMonthlyFeeUsdCents: {
    schema: z.number().int().min(0).max(50_000),
    description:
      'Monthly fee per active virtual card. USD cents. 0 = disabled. Cron job charges every active card on the 1st of each month; cards with insufficient backing funds are skipped + retried next month.',
    default: 0,
  },
  cardTransactionFeePercent: {
    schema: z.number().min(0).max(10),
    description:
      'Percentage fee on each card transaction (charge or auth). 0 = no transaction fee on top of what Graph passes through. Applied during the card.transaction webhook.',
    default: 0,
  },
  cardForeignTxFeePercent: {
    schema: z.number().min(0).max(10),
    description:
      'Additional percentage fee when the merchant currency is not USD (foreign-currency surcharge). 0 = disabled. Stacks on top of cardTransactionFeePercent.',
    default: 0,
  },
  cardReplacementFeeUsdCents: {
    schema: z.number().int().min(0).max(50_000),
    description:
      'Fee charged when the user requests a replacement card (lost / compromised / damaged). USD cents. 0 = free.',
    default: 0,
  },

  // Compliance
  kycRequiredForWithdrawal: {
    schema: z.boolean(),
    description: 'Require KYC tier ≥ T1 before a user can withdraw',
    default: true,
  },
  dailyWithdrawalLimitUsd: {
    schema: z.number().min(0).max(10_000_000),
    description: 'Per-user daily withdrawal limit in USD',
    default: 50_000,
  },
  monthlyWithdrawalLimitUsd: {
    schema: z.number().min(0).max(100_000_000),
    description: 'Per-user monthly withdrawal limit in USD',
    default: 500_000,
  },
  amlAlertThresholdUsd: {
    schema: z.number().min(0).max(10_000_000),
    description: 'Transactions above this trigger AML review',
    default: 10_000,
  },
} as const;

type SettingKey = keyof typeof SETTING_SCHEMAS;

const ALL_KEYS = Object.keys(SETTING_SCHEMAS) as SettingKey[];
const ALLOWED_KEY_SET = new Set<string>(ALL_KEYS);

// ── GET: return all settings (row exists or default) ───────────────────────
export async function GET() {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: ALL_KEYS } },
    select: { key: true, value: true, updatedAt: true },
  });

  const rowMap = new Map(
    rows.map((r: (typeof rows)[number]) => [r.key, r] as const),
  );

  const result: Record<string, unknown> = {};
  const meta: Record<string, { description: string; updatedAt: string | null }> = {};

  for (const key of ALL_KEYS) {
    const def = SETTING_SCHEMAS[key];
    const row = rowMap.get(key);
    result[key] = row?.value ?? def.default;
    meta[key] = {
      description: def.description,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  }

  return NextResponse.json({ settings: result, meta });
}

// ── PUT: bulk-upsert selected settings ─────────────────────────────────────
const PutSchema = z.object({
  updates: z.record(z.unknown()).refine(
    (u) => Object.keys(u).length > 0 && Object.keys(u).length <= 50,
    'updates must contain 1..50 keys',
  ),
});

export async function PUT(req: NextRequest) {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { updates } = parsed.data;

  // Validate every key + value against its schema BEFORE writing
  const validated: Array<{ key: SettingKey; value: unknown }> = [];
  const errors: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(updates)) {
    if (!ALLOWED_KEY_SET.has(key)) {
      errors[key] = 'Unknown setting key';
      continue;
    }
    const def = SETTING_SCHEMAS[key as SettingKey];
    const vr = def.schema.safeParse(rawValue);
    if (!vr.success) {
      errors[key] = vr.error.issues[0]?.message ?? 'Invalid value';
      continue;
    }
    validated.push({ key: key as SettingKey, value: vr.data });
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      { error: 'Validation failed', fields: errors },
      { status: 422 },
    );
  }

  // Upsert each + one audit log row describing the whole change
  const now = new Date();
  await prisma.$transaction(async (tx: any) => {
    for (const { key, value } of validated) {
      await tx.platformSetting.upsert({
        where: { key },
        create: {
          key,
          value: value as any,
          description: SETTING_SCHEMAS[key].description,
        },
        update: { value: value as any, updatedAt: now },
      });
    }
    await tx.adminAuditLog.create({
      data: {
        adminId: session.userId,
        action: 'PLATFORM_SETTINGS_UPDATED',
        resourceType: 'PlatformSetting',
        metadata: {
          keys: validated.map((v) => v.key),
          // Values deliberately not recorded — could be verbose/sensitive.
          // The `keys` list is enough for "who flipped what when".
        },
      },
    });
  });

  logger.info(
    {
      adminId: session.userId,
      keys: validated.map((v) => v.key),
    },
    'platform settings updated',
  );

  return NextResponse.json({
    ok: true,
    updated: validated.map((v) => v.key),
  });
}
