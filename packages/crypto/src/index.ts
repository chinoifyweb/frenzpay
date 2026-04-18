/**
 * @frenzpay/crypto — Envelope encryption for PII fields
 *
 * Scheme:
 *   - Each field gets a unique 256-bit Data Encryption Key (DEK)
 *   - Plaintext is encrypted with AES-256-GCM using the DEK
 *   - The DEK is wrapped (encrypted) with the Key Encryption Key (KEK)
 *     from Infisical/env. The KEK is never stored in the DB.
 *   - DB stores: { ciphertext, iv, authTag, wrappedDek, keyVersion }
 *
 * Blind index:
 *   - For equality lookups on encrypted fields (e.g. BVN duplicate check)
 *   - HMAC-SHA-256(BLIND_INDEX_KEY, normalised_plaintext)
 *   - Blind-index key is SEPARATE from KEK and rotated independently
 *
 * Non-negotiable: this package has ZERO external dependencies beyond Node crypto.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CipherPayload {
  /** AES-256-GCM ciphertext, base64-encoded */
  ciphertext: string
  /** 12-byte IV, base64-encoded */
  iv: string
  /** 16-byte auth tag, base64-encoded */
  authTag: string
  /** DEK wrapped (encrypted) with KEK, base64-encoded */
  wrappedDek: string
  /** KEK version identifier — allows KEK rotation without re-encrypting data immediately */
  keyVersion: string
}

export type EncryptedField = CipherPayload

// ─────────────────────────────────────────────────────────────────────────────
// Key loading — pulled from process.env at call time, never cached globally
// ─────────────────────────────────────────────────────────────────────────────

function getKek(version?: string): Buffer {
  const envKey = version ? `KEK_${version.toUpperCase()}` : 'KEK'
  const raw = process.env[envKey] ?? process.env['ENCRYPTION_KEY']
  if (!raw) {
    throw new Error(
      `[crypto] KEK not found. Set KEK or ENCRYPTION_KEY env var. ` +
        `(looking for key version: ${version ?? 'current'})`,
    )
  }
  const buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) {
    throw new Error(
      `[crypto] KEK must be 32 bytes (256 bits) base64-encoded. Got ${buf.length} bytes.`,
    )
  }
  return buf
}

function getBlindIndexKey(): Buffer {
  const raw = process.env['BLIND_INDEX_KEY']
  if (!raw) throw new Error('[crypto] BLIND_INDEX_KEY env var not set.')
  const buf = Buffer.from(raw, 'base64')
  if (buf.length < 32) {
    throw new Error('[crypto] BLIND_INDEX_KEY must be >= 32 bytes (256 bits) base64-encoded.')
  }
  return buf
}

function getCurrentKeyVersion(): string {
  return process.env['KEK_KEY_ID'] ?? 'v1'
}

// ─────────────────────────────────────────────────────────────────────────────
// DEK operations (AES-256-GCM key wrap)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrap (encrypt) a DEK with the KEK using AES-256-GCM.
 * Returns base64-encoded `iv:authTag:ciphertext`.
 */
function wrapDek(dek: Buffer, kek: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', kek, iv)
  const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':')
}

/**
 * Unwrap (decrypt) a wrapped DEK.
 */
function unwrapDek(wrapped: string, kek: Buffer): Buffer {
  const parts = wrapped.split(':')
  if (parts.length !== 3) throw new Error('[crypto] Invalid wrapped DEK format.')
  const [ivB64, authTagB64, ciphertextB64] = parts as [string, string, string]
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')
  const ciphertext = Buffer.from(ciphertextB64, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', kek, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string into a CipherPayload.
 * Generates a fresh DEK for every call — never reuses DEKs.
 *
 * @param plaintext - UTF-8 string to encrypt
 * @param _context - Reserved for audit/binding (e.g. user ID). Not yet used in v1.
 */
export function encryptField(plaintext: string, _context?: string): CipherPayload {
  const keyVersion = getCurrentKeyVersion()
  const kek = getKek(keyVersion)

  // Generate fresh 256-bit DEK
  const dek = randomBytes(32)
  const iv = randomBytes(12)

  const cipher = createCipheriv('aes-256-gcm', dek, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    wrappedDek: wrapDek(dek, kek),
    keyVersion,
  }
}

/**
 * Decrypt a CipherPayload back to plaintext.
 *
 * @param payload - The CipherPayload from the DB
 * @param _context - Reserved (must match context used during encryption in v2+)
 */
export function decryptField(payload: CipherPayload, _context?: string): string {
  const kek = getKek(payload.keyVersion)
  const dek = unwrapDek(payload.wrappedDek, kek)

  const iv = Buffer.from(payload.iv, 'base64')
  const authTag = Buffer.from(payload.authTag, 'base64')
  const ciphertext = Buffer.from(payload.ciphertext, 'base64')

  const decipher = createDecipheriv('aes-256-gcm', dek, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

/**
 * Compute a deterministic blind index for equality lookups on encrypted fields.
 * Uses HMAC-SHA-256 with the separate BLIND_INDEX_KEY.
 *
 * @param value - Value to index (lowercased + trimmed before hashing)
 * @returns 32-byte hex string
 */
export function blindIndex(value: string): string {
  const key = getBlindIndexKey()
  const normalised = value.toLowerCase().trim()
  return createHmac('sha256', key).update(normalised, 'utf8').digest('hex')
}

/**
 * Constant-time comparison for blind index strings (prevents timing attacks).
 */
export function blindIndexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

/**
 * Re-wrap all DEKs under a new KEK version. Call during KEK rotation.
 * Returns updated CipherPayloads with the new wrappedDek and keyVersion.
 *
 * @param payloads - Array of existing CipherPayloads to rotate
 * @param newKeyVersion - New KEK version identifier (e.g. "v2")
 */
export function rotateKey(payloads: CipherPayload[], newKeyVersion: string): CipherPayload[] {
  const newKek = getKek(newKeyVersion)
  return payloads.map((payload) => {
    const oldKek = getKek(payload.keyVersion)
    const dek = unwrapDek(payload.wrappedDek, oldKek)
    return {
      ...payload,
      wrappedDek: wrapDek(dek, newKek),
      keyVersion: newKeyVersion,
    }
  })
}

/**
 * Type guard — check if a value from the DB is a valid CipherPayload.
 */
export function isCipherPayload(value: unknown): value is CipherPayload {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v['ciphertext'] === 'string' &&
    typeof v['iv'] === 'string' &&
    typeof v['authTag'] === 'string' &&
    typeof v['wrappedDek'] === 'string' &&
    typeof v['keyVersion'] === 'string'
  )
}
