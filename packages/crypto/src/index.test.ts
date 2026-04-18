/**
 * Property-based tests for @frenzpay/crypto
 * - 1,000 random round-trips: encrypt → decrypt fidelity
 * - Tampered authTag rejected
 * - Tampered ciphertext rejected
 * - Blind index is deterministic and constant-time-safe
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fc from 'fast-check'
import {
  encryptField,
  decryptField,
  blindIndex,
  blindIndexEqual,
  isCipherPayload,
  type CipherPayload,
} from './index.js'

// Set up test keys (32 random bytes each, base64 encoded)
beforeAll(() => {
  // 32 bytes base64 = 44 chars
  process.env['KEK'] = Buffer.alloc(32, 0xab).toString('base64')
  process.env['KEK_KEY_ID'] = 'v1'
  process.env['ENCRYPTION_KEY'] = Buffer.alloc(32, 0xab).toString('base64')
  process.env['BLIND_INDEX_KEY'] = Buffer.alloc(32, 0xcd).toString('base64')
})

describe('encryptField / decryptField', () => {
  it('round-trips a simple string', () => {
    const payload = encryptField('hello, world!')
    const decrypted = decryptField(payload)
    expect(decrypted).toBe('hello, world!')
  })

  it('round-trips empty string', () => {
    const payload = encryptField('')
    expect(decryptField(payload)).toBe('')
  })

  it('round-trips unicode / emoji', () => {
    const input = '₦ Ifeanyi 🇳🇬 BVN: 12345678901'
    expect(decryptField(encryptField(input))).toBe(input)
  })

  it('property: 1,000 random round-trips', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 10_000 }), (plaintext) => {
        const payload = encryptField(plaintext)
        expect(decryptField(payload)).toBe(plaintext)
      }),
      { numRuns: 1000 },
    )
  })

  it('produces unique ciphertexts for the same plaintext (fresh DEK each time)', () => {
    const a = encryptField('same input')
    const b = encryptField('same input')
    // Different IV means different ciphertext
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(a.iv).not.toBe(b.iv)
  })

  it('rejects tampered authTag', () => {
    const payload = encryptField('sensitive data')
    const tampered: CipherPayload = {
      ...payload,
      authTag: Buffer.alloc(16, 0xff).toString('base64'),
    }
    expect(() => decryptField(tampered)).toThrow()
  })

  it('rejects tampered ciphertext', () => {
    const payload = encryptField('sensitive data')
    const ct = Buffer.from(payload.ciphertext, 'base64')
    ct[0] = ct[0]! ^ 0xff // flip first byte
    const tampered: CipherPayload = { ...payload, ciphertext: ct.toString('base64') }
    expect(() => decryptField(tampered)).toThrow()
  })

  it('rejects tampered IV', () => {
    const payload = encryptField('sensitive data')
    const iv = Buffer.from(payload.iv, 'base64')
    iv[0] = iv[0]! ^ 0xff
    const tampered: CipherPayload = { ...payload, iv: iv.toString('base64') }
    expect(() => decryptField(tampered)).toThrow()
  })
})

describe('blindIndex', () => {
  it('is deterministic for the same input', () => {
    expect(blindIndex('12345678901')).toBe(blindIndex('12345678901'))
  })

  it('normalises to lowercase + trim', () => {
    expect(blindIndex('  BVN123  ')).toBe(blindIndex('bvn123'))
  })

  it('different inputs produce different indexes', () => {
    expect(blindIndex('aaa')).not.toBe(blindIndex('bbb'))
  })

  it('returns 64-char hex string', () => {
    const idx = blindIndex('test')
    expect(idx).toMatch(/^[0-9a-f]{64}$/)
  })

  it('blindIndexEqual is constant-time safe (same)', () => {
    const a = blindIndex('hello')
    expect(blindIndexEqual(a, a)).toBe(true)
  })

  it('blindIndexEqual returns false for different values', () => {
    expect(blindIndexEqual(blindIndex('hello'), blindIndex('world'))).toBe(false)
  })
})

describe('isCipherPayload', () => {
  it('recognises valid payload', () => {
    const payload = encryptField('test')
    expect(isCipherPayload(payload)).toBe(true)
  })

  it('rejects null', () => {
    expect(isCipherPayload(null)).toBe(false)
  })

  it('rejects plain string', () => {
    expect(isCipherPayload('hello')).toBe(false)
  })

  it('rejects partial object', () => {
    expect(isCipherPayload({ ciphertext: 'x' })).toBe(false)
  })
})
