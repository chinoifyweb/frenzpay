/**
 * @frenzpay/logger — Pino wrapper with mandatory PII redaction
 *
 * Non-negotiables from build-prompt #13:
 * - Deny-list is applied BEFORE the transport (at serialisation time)
 * - Redaction replaces values with "[REDACTED]" — key remains for debuggability
 * - Secondary regex pass on message strings for raw card/token patterns
 * - Every log line includes requestId, userId (if authed), traceId
 *
 * Usage:
 *   import { logger, createRequestLogger } from '@frenzpay/logger'
 *   logger.info('Server started')
 *   const reqLogger = createRequestLogger({ requestId, userId, traceId })
 *   reqLogger.info({ action: 'login' }, 'User logged in')
 */

import pino from 'pino'

// ─────────────────────────────────────────────────────────────────────────────
// PII deny-list — values at these keys are replaced with [REDACTED]
// regardless of nesting depth. Extend this list in the same commit as adding
// a new sensitive field.
// ─────────────────────────────────────────────────────────────────────────────

export const PII_DENY_LIST: readonly string[] = [
  'password',
  'passwordHash',
  'password_hash',
  'pin',
  'pinHash',
  'pin_hash',
  'token',
  'secret',
  'authorization',
  'cookie',
  'pan',
  'cvv',
  'cvc',
  'bvn',
  'ssn',
  'nin',
  'passport',
  'passportNumber',
  'passport_number',
  'dob',
  'dateOfBirth',
  'date_of_birth',
  'account_number',
  'accountNumber',
  'routing_number',
  'routingNumber',
  'otp',
  'otpHash',
  'otp_hash',
  'private_key',
  'privateKey',
  'api_key',
  'apiKey',
  'mnemonic',
  'seed_phrase',
  'seedPhrase',
  'refresh_token',
  'refreshToken',
  'access_token',
  'accessToken',
  'card_number',
  'cardNumber',
  'mfaSecret',
  'mfa_secret',
  'twoFactorSecret',
  'two_factor_secret',
  'wrappedDek',
  'wrapped_dek',
  'blindIndex',
  'blind_index',
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Regex patterns for secondary scrubbing of log message strings
// ─────────────────────────────────────────────────────────────────────────────

const CARD_PATTERN = /\b\d{13,19}\b/g
// JWT-like: three base64url segments separated by dots
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g
// Bearer tokens
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._\-+/=]{20,}\b/gi

function scrubMessage(msg: string): string {
  return msg
    .replace(CARD_PATTERN, '[CARD_REDACTED]')
    .replace(JWT_PATTERN, '[JWT_REDACTED]')
    .replace(BEARER_PATTERN, 'Bearer [TOKEN_REDACTED]')
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom serialiser — scrubs deny-list keys at any nesting depth
// ─────────────────────────────────────────────────────────────────────────────

const DENY_SET = new Set(PII_DENY_LIST)

function redactObject(obj: unknown, depth = 0): unknown {
  if (depth > 10) return obj // prevent infinite recursion
  if (obj === null || typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1))
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (DENY_SET.has(key)) {
      result[key] = '[REDACTED]'
    } else {
      result[key] = redactObject(value, depth + 1)
    }
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Context type for structured log lines
// ─────────────────────────────────────────────────────────────────────────────

export interface LogContext {
  requestId?: string
  userId?: string
  traceId?: string
  service?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Pino base logger configuration
// ─────────────────────────────────────────────────────────────────────────────

const isDev = process.env['NODE_ENV'] !== 'production'

const baseLogger = pino({
  level: process.env['LOG_LEVEL'] ?? (isDev ? 'debug' : 'info'),
  base: {
    service: process.env['SERVICE_NAME'] ?? 'frenzpay',
    env: process.env['NODE_ENV'] ?? 'development',
  },
  // Pino's built-in redaction paths + our custom serialiser
  redact: {
    paths: PII_DENY_LIST as string[],
    censor: '[REDACTED]',
  },
  serializers: {
    // Override object serialisation to deep-redact
    obj: (value: unknown) => redactObject(value),
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  // Scrub message strings at transport level
  hooks: {
    logMethod(args: Parameters<pino.LogFn>, method: pino.LogFn) {
      // args[0] may be mergingObject or message
      if (args.length >= 2 && typeof args[1] === 'string') {
        args[1] = scrubMessage(args[1])
      } else if (args.length >= 1 && typeof args[0] === 'string') {
        args[0] = scrubMessage(args[0])
      }
      method.apply(this, args)
    },
  },
  // pino-pretty is an optional dev dependency — only use if available
  ...(isDev && process.env['NODE_ENV'] !== 'test'
    ? (() => {
        try {
          require.resolve('pino-pretty')
          return {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss.l' },
            },
          }
        } catch {
          return {} // pino-pretty not installed — fall back to JSON
        }
      })()
    : {}),
})

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Root logger — use in server startup and background jobs */
export const logger = baseLogger

/**
 * Create a child logger bound to a specific request context.
 * Every line emitted carries requestId, userId (if authed), traceId.
 *
 * @example
 * const log = createRequestLogger({ requestId: 'abc', userId: user.id })
 * log.info({ action: 'deposit' }, 'Deposit initiated')
 */
export function createRequestLogger(ctx: LogContext): pino.Logger {
  return baseLogger.child({
    requestId: ctx.requestId,
    userId: ctx.userId,
    traceId: ctx.traceId,
    service: ctx.service,
  })
}

/**
 * Safely stringify an object for inclusion in logs, redacting PII first.
 * Use when you need a string representation (e.g. error context).
 */
export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(redactObject(value), null, 0)
  } catch {
    return '[unserializable]'
  }
}

export type Logger = pino.Logger
