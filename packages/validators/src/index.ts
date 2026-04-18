import { z } from 'zod';

// Email: lowercase, max 255
export const emailSchema = z
  .string()
  .email()
  .max(255)
  .transform((v) => v.toLowerCase());

export type Email = z.infer<typeof emailSchema>;

// Phone: E.164 format (+12345678901), 10-15 digits after the +
export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{9,14}$/, 'Phone must be in E.164 format (+12345678901)');

export type Phone = z.infer<typeof phoneSchema>;

// Password: min 12 chars, uppercase, lowercase, digit, special char
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .refine((v) => /[A-Z]/.test(v), 'Password must contain at least one uppercase letter')
  .refine((v) => /[a-z]/.test(v), 'Password must contain at least one lowercase letter')
  .refine((v) => /[0-9]/.test(v), 'Password must contain at least one digit')
  .refine(
    (v) => /[^A-Za-z0-9]/.test(v),
    'Password must contain at least one special character',
  );

export type Password = z.infer<typeof passwordSchema>;

// PIN: exactly 6 digits
export const pinSchema = z
  .string()
  .regex(/^\d{6}$/, 'PIN must be exactly 6 digits');

export type Pin = z.infer<typeof pinSchema>;

// FrenzTag: 6-8 chars, [a-z0-9], must start with a letter
export const frenzTagSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]{5,7}$/, 'FrenzTag must be 6-8 characters, alphanumeric (lowercase), and start with a letter');

export type FrenzTag = z.infer<typeof frenzTagSchema>;

// Money amount: numeric string representing BigInt in smallest unit
export const moneyAmountSchema = z
  .string()
  .regex(/^\d+$/, 'Amount must be a non-negative integer string');

export type MoneyAmount = z.infer<typeof moneyAmountSchema>;

// Currency enum
export const currencySchema = z.enum(['USD', 'NGN', 'USDC', 'GBP', 'EUR']);

export type Currency = z.infer<typeof currencySchema>;

// KYC tier enum
export const kycTierSchema = z.enum(['T0', 'T1', 'T2', 'T3']);

export type KycTier = z.infer<typeof kycTierSchema>;
