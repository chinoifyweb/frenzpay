/**
 * Unit tests for the Bridge provider client (stub-mode behaviour).
 *
 * These tests verify:
 * - Stub mode kicks in when BRIDGE_API_KEY is missing
 * - Webhook signature verification accepts valid HMAC-SHA256 signatures
 * - Idempotency key generation produces unique values
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  createBridgeCustomer,
  createBridgeVirtualAccount,
  verifyBridgeWebhookSignature,
  generateBridgeIdempotencyKey,
} from './bridge.js';

describe('Bridge client — stub mode', () => {
  beforeEach(() => {
    delete process.env['BRIDGE_API_KEY'];
    delete process.env['BRIDGE_WEBHOOK_SECRET'];
  });

  it('createBridgeCustomer returns deterministic stub ID based on internalUserId', async () => {
    const userId = '11111111-2222-3333-4444-555555555555';
    const r1 = await createBridgeCustomer({
      email: 'a@b.co',
      firstName: 'Jane',
      lastName: 'Doe',
      country: 'NG',
      internalUserId: userId,
    });
    const r2 = await createBridgeCustomer({
      email: 'different@email.co',
      firstName: 'X',
      lastName: 'Y',
      country: 'NG',
      internalUserId: userId,
    });

    expect(r1.customerId).toMatch(/^bridge_cust_stub_/);
    expect(r1.customerId).toBe(r2.customerId);
    expect(r1.status).toBe('active');
  });

  it('createBridgeVirtualAccount returns routing + account + bank', async () => {
    const result = await createBridgeVirtualAccount('cust_123', 'idem-1');

    expect(result.virtualAccountId).toMatch(/^bridge_va_stub_/);
    expect(result.routingNumber).toMatch(/^\d{9}$/);
    expect(result.accountNumber.length).toBeGreaterThan(0);
    expect(result.bankName.length).toBeGreaterThan(0);
    expect(result.settlementCurrency).toBe('USDC');
  });

  it('createBridgeVirtualAccount is deterministic per customer (same stub account)', async () => {
    const r1 = await createBridgeVirtualAccount('cust_same', 'idem-1');
    const r2 = await createBridgeVirtualAccount('cust_same', 'idem-2');
    expect(r1.accountNumber).toBe(r2.accountNumber);
    expect(r1.routingNumber).toBe(r2.routingNumber);
  });
});

describe('verifyBridgeWebhookSignature', () => {
  const secret = 'test-webhook-secret-12345';
  const body = JSON.stringify({ id: 'evt_1', event_type: 'deposit', data: { amount: '100' } });

  beforeEach(() => {
    process.env['BRIDGE_WEBHOOK_SECRET'] = secret;
    process.env['NODE_ENV'] = 'test';
  });

  it('accepts a valid HMAC-SHA256 signature', () => {
    const sig = createHmac('sha256', secret).update(body, 'utf8').digest('hex');
    expect(verifyBridgeWebhookSignature(body, sig)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = createHmac('sha256', secret).update(body, 'utf8').digest('hex');
    const tampered = body.replace('100', '99999');
    expect(verifyBridgeWebhookSignature(tampered, sig)).toBe(false);
  });

  it('rejects a wrong signature', () => {
    expect(verifyBridgeWebhookSignature(body, 'wrong')).toBe(false);
  });

  it('rejects empty signature', () => {
    expect(verifyBridgeWebhookSignature(body, '')).toBe(false);
  });

  it('allows unsigned webhooks in dev when secret is missing', () => {
    delete process.env['BRIDGE_WEBHOOK_SECRET'];
    process.env['NODE_ENV'] = 'development';
    expect(verifyBridgeWebhookSignature(body, 'anything')).toBe(true);
  });

  it('rejects unsigned webhooks in production even when secret is missing', () => {
    delete process.env['BRIDGE_WEBHOOK_SECRET'];
    process.env['NODE_ENV'] = 'production';
    expect(verifyBridgeWebhookSignature(body, 'anything')).toBe(false);
  });
});

describe('generateBridgeIdempotencyKey', () => {
  it('produces unique keys with the given prefix', () => {
    const k1 = generateBridgeIdempotencyKey('test');
    const k2 = generateBridgeIdempotencyKey('test');
    expect(k1).not.toBe(k2);
    expect(k1.startsWith('test-')).toBe(true);
    expect(k2.startsWith('test-')).toBe(true);
  });
});
