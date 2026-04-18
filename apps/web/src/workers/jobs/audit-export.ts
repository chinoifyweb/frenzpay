/**
 * Job: audit-export
 * Schedule: 0 5 * * *  (05:00 Lagos daily)
 *
 * Exports the previous day's AuditLog entries as a signed, compressed JSONL
 * file and uploads to MinIO bucket `frenzpay-audit` for long-term retention
 * and regulatory access.
 *
 * Currently a STUB. The MinIO bucket + the signing key need to be in place
 * first. See `S3_BUCKET_AUDIT` in `.env.example`.
 */
import { logger } from '@frenzpay/logger';

export async function auditExport(): Promise<void> {
  logger.debug('[audit-export] stub — MinIO audit bucket not yet configured');
}
