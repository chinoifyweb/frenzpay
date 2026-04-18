/**
 * Unit tests for Paystack provider client (stub-mode behaviour).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  listNigerianBanks,
  resolveNigerianAccount,
  createPaystackRecipient,
  initiatePaystackTransfer,
  verifyPaystackWebhookSignature,
} from './paystack.js';

describe('Paystack — stub mode', () => {
  beforeEach(() => {
    delete process.env['PAYSTACK_SECRET_KEY'];
  });

  it('listNigerianBanks returns a non-empty list of active banks', async () => {
    const banks = await listNigerianBanks();
    expect(banks.length).toBeGreaterThan(5);
    expect(banks.every((b) => b.active && b.country === 'Nigeria')).toBe(true);
    expect(banks.some((b) => b.code === '058')).toBe(true);
  });

  it('resolveNigerianAccount returns a deterministic name for a given account', async () => {
    const r1 = await resolveNigerianAccount('0123456789', '058');
    const r2 = await resolveNigerianAccount('0123456789', '058');
    expect(r1.accountName).toBe(r2.accountName);
    expect(r1.accountName).toMatch(/^[A-Z]+ [A-Z]+$/);
    expect(r1.accountNumber).toBe('0123456789');
  });

  it('resolveNigerianAccount rejects bad account numbers', async () => {
    await expect(resolveNigerianAccount('12345', '058')).rejects.toThrow(/10 digits/);
    await expect(resolveNigerianAccount('abcdefghij', '058')).rejects.toThrow(/10 digits/);
  });

  it('createPaystackRecipient returns a recipient_code', async () => {
    const r = await createPaystackRecipient('JANE DOE', '058', '0123456789');
    expect(r.recipientCode).toMatch(/^RCP_/);
    expect(r.accountNumber).toBe('0123456789');
    expect(r.currency).toBe('NGN');
  });

  it('initiatePaystackTransfer returns pending status in stub mode', async () => {
    const tx = await initiatePaystackTransfer({
      recipientCode: 'RCP_test',
      amountKobo: 1_000_000n,
      reference: 'ref-abc-123',
    });
    expect(tx.status).toBe('pending');
    expect(tx.transferCode).toMatch(/^TRF_/);
    expect(tx.amount).toBe(1_000_000);
    expect(tx.currency).toBe('NGN');
  });

  it('initiatePaystackTransfer rejects zero/negative amounts', async () => {
    await expect(
      initiatePaystackTransfer({ recipientCode: 'x', amountKobo: 0n, reference: 'r' }),
    ).rejects.toThrow(/positive/);
  });
});

describe('verifyPaystackWebhookSignature', () => {
  const secretKey = 'sk_test_paystack_12345';
  const body = JSON.stringify({ event: 'transfer.success', data: { reference: 'ref1' } });

  beforeEach(() => {
    process.env['PAYSTACK_SECRET_KEY'] = secretKey;
    process.env['NODE_ENV'] = 'test';
  });

  it('accepts a valid HMAC-SHA512 signature', () => {
    const sig = createHmac('sha512', secretKey).update(body, 'utf8').digest('hex');
    expect(verifyPaystackWebhookSignature(body, sig)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = createHmac('sha512', secretKey).update(body, 'utf8').digest('hex');
    const tampered = body.replace('ref1', 'ref2');
    expect(verifyPaystackWebhookSignature(tampered, sig)).toBe(false);
  });

  it('rejects empty or malformed signatures', () => {
    expect(verifyPaystackWebhookSignature(body, '')).toBe(false);
    expect(verifyPaystackWebhookSignature(body, 'not-hex')).toBe(false);
  });

  it('allows unsigned webhooks in dev when secret is missing', () => {
    delete process.env['PAYSTACK_SECRET_KEY'];
    process.env['NODE_ENV'] = 'development';
    expect(verifyPaystackWebhookSignature(body, 'any')).toBe(true);
  });

  it('rejects unsigned webhooks in production', () => {
    delete process.env['PAYSTACK_SECRET_KEY'];
    process.env['NODE_ENV'] = 'production';
    expect(verifyPaystackWebhookSignature(body, 'any')).toBe(false);
  });
});
