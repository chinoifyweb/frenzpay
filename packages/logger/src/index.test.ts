/**
 * Unit tests for @frenzpay/logger
 * Proves: redaction fires on each deny-list key + nested objects + arrays
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PII_DENY_LIST, safeStringify } from './index.js'

describe('PII_DENY_LIST', () => {
  it('contains all required sensitive keys', () => {
    const required = [
      'password', 'pin', 'token', 'secret', 'authorization', 'cookie',
      'pan', 'cvv', 'cvc', 'bvn', 'ssn', 'nin', 'passport', 'dob',
      'account_number', 'routing_number', 'otp', 'private_key', 'api_key',
      'mnemonic', 'refresh_token', 'access_token', 'card_number',
    ]
    for (const key of required) {
      expect(PII_DENY_LIST).toContain(key)
    }
  })
})

describe('safeStringify (redactObject)', () => {
  it('redacts top-level deny-list keys', () => {
    const result = JSON.parse(safeStringify({ password: 'hunter2', name: 'Ifeanyi' }))
    expect(result.password).toBe('[REDACTED]')
    expect(result.name).toBe('Ifeanyi')
  })

  it('redacts nested objects', () => {
    const result = JSON.parse(safeStringify({
      user: { id: '123', bvn: '12345678901', email: 'test@example.com' }
    }))
    expect(result.user.bvn).toBe('[REDACTED]')
    expect(result.user.email).toBe('test@example.com')
  })

  it('redacts within arrays', () => {
    const result = JSON.parse(safeStringify([
      { cvv: '123', amount: 100 },
      { cvv: '456', amount: 200 },
    ]))
    expect(result[0].cvv).toBe('[REDACTED]')
    expect(result[0].amount).toBe(100)
    expect(result[1].cvv).toBe('[REDACTED]')
  })

  it('redacts deeply nested PII', () => {
    const result = JSON.parse(safeStringify({
      level1: { level2: { level3: { secret: 'topsecret', safe: 'visible' } } }
    }))
    expect(result.level1.level2.level3.secret).toBe('[REDACTED]')
    expect(result.level1.level2.level3.safe).toBe('visible')
  })

  it('handles null and undefined gracefully', () => {
    expect(() => safeStringify(null)).not.toThrow()
    expect(() => safeStringify(undefined)).not.toThrow()
  })

  it('handles non-object values', () => {
    expect(safeStringify('hello')).toBe('"hello"')
    expect(safeStringify(42)).toBe('42')
    expect(safeStringify(true)).toBe('true')
  })

  it('redacts all deny-list keys', () => {
    // Build an object with every deny-list key
    const obj: Record<string, string> = {}
    for (const key of PII_DENY_LIST) {
      obj[key] = `value_of_${key}`
    }
    const result = JSON.parse(safeStringify(obj))
    for (const key of PII_DENY_LIST) {
      expect(result[key]).toBe('[REDACTED]')
    }
  })

  it('does not redact keys that sound similar but are not in deny-list', () => {
    const result = JSON.parse(safeStringify({ passwordLength: 8, tokenCount: 3 }))
    // These keys are NOT in the deny-list
    expect(result.passwordLength).toBe(8)
    expect(result.tokenCount).toBe(3)
  })
})
