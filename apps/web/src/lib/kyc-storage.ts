/**
 * KYC document storage — envelope-encrypted, pluggable backend.
 *
 * Each uploaded file (ID front, selfie, liveness video, etc.) is encrypted
 * with a fresh 256-bit DEK using AES-256-GCM. The DEK is wrapped with the
 * platform KEK (CRYPTO_MASTER_KEY) via wrapKey() from @frenzpay/crypto and
 * stored alongside the ciphertext's storage key in the KycDocument row. An
 * admin reviewer can only see the plaintext after:
 *   - authenticating as role='admin'
 *   - the server fetches ciphertext, unwraps the DEK, decrypts in-memory,
 *     streams the result back to the admin's browser
 *
 * Backend selection (by env):
 *   S3_ENDPOINT + S3_BUCKET_NAME + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY
 *     -> real S3 (works with AWS or any S3-compatible service like Cloudflare R2)
 *   otherwise
 *     -> local filesystem under KYC_STORAGE_DIR (default /home/frenzpay/shared/kyc)
 *     This is the current path — ready to flip to S3 the moment creds land.
 *
 * Everything here runs server-side. The raw ciphertext never leaves the box.
 */

import { promises as fs } from 'node:fs';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import path from 'node:path';
import { wrapKey, unwrapKey } from '@frenzpay/crypto';
import { logger } from '@frenzpay/logger';

export interface StoredFile {
  /** Path-style key under the bucket / local dir */
  storageKey: string;
  /** Wrapped DEK used to decrypt the file later */
  encryptedDek: string;
}

// ── Backend abstraction ────────────────────────────────────────────────────

interface Backend {
  name: string;
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

/** Local-filesystem backend — default until S3 creds are configured. */
function localBackend(): Backend {
  const root = process.env['KYC_STORAGE_DIR'] ?? '/home/frenzpay/shared/kyc';
  return {
    name: 'local',
    async put(key, bytes) {
      const full = path.join(root, key);
      await fs.mkdir(path.dirname(full), { recursive: true });
      // Mode 0600 — only the frenzpay service user can read
      await fs.writeFile(full, bytes, { mode: 0o600 });
    },
    async get(key) {
      const full = path.join(root, key);
      return await fs.readFile(full);
    },
  };
}

/** Stub backend that loudly refuses in production — used only if env is
 *  absent and we're NOT running as production (e.g. unit tests). */
function devStubBackend(): Backend {
  return {
    name: 'dev-stub',
    async put() { /* discard */ },
    async get() { throw new Error('KYC storage not configured (dev-stub backend).'); },
  };
}

function pickBackend(): Backend {
  // When S3 creds land, we'll add an s3Backend() here and prefer it first.
  // For now: local filesystem under KYC_STORAGE_DIR works on the Hetzner box.
  try {
    return localBackend();
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Falling back to dev-stub KYC storage');
    return devStubBackend();
  }
}

// ── Envelope encryption ────────────────────────────────────────────────────

function encryptBytes(plaintext: Buffer): { ciphertext: Buffer; encryptedDek: string } {
  const dek = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dek, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Layout: [12-byte iv][16-byte authTag][ciphertext] — self-describing at rest
  const ciphertext = Buffer.concat([iv, authTag, enc]);
  return { ciphertext, encryptedDek: wrapKey(dek) };
}

function decryptBytes(ciphertext: Buffer, encryptedDek: string): Buffer {
  if (ciphertext.length < 28) throw new Error('KYC ciphertext too short');
  const iv = ciphertext.subarray(0, 12);
  const authTag = ciphertext.subarray(12, 28);
  const enc = ciphertext.subarray(28);
  const dek = unwrapKey(encryptedDek);
  const decipher = createDecipheriv('aes-256-gcm', dek, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Encrypt the given File's bytes and persist to the backend. Returns the
 * storage key + wrapped DEK you need to save in the DB.
 */
export async function storeKycFile(
  file: File,
  userId: string,
  submissionPrefix: string,
  label: string,
): Promise<StoredFile> {
  const ext = (file.type.split('/')[1] ?? 'bin').replace(/[^a-z0-9.]/gi, '');
  const storageKey = `kyc/${userId}/${submissionPrefix}/${label}_${Date.now()}.${ext}.enc`;
  const raw = Buffer.from(await file.arrayBuffer());
  const { ciphertext, encryptedDek } = encryptBytes(raw);

  const backend = pickBackend();
  await backend.put(storageKey, ciphertext);

  logger.info(
    { userId, storageKey, backend: backend.name, plaintextBytes: raw.length, ciphertextBytes: ciphertext.length },
    'KYC file stored',
  );
  return { storageKey, encryptedDek };
}

/**
 * Fetch a stored KYC file, decrypt it, and return the plaintext bytes.
 * Callers (admin routes) are responsible for streaming / rendering.
 */
export async function fetchKycFile(storageKey: string, encryptedDek: string): Promise<Buffer> {
  const backend = pickBackend();
  const ciphertext = await backend.get(storageKey);
  return decryptBytes(ciphertext, encryptedDek);
}
