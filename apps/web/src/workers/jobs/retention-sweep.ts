/**
 * Job: retention-sweep
 * Schedule: 0 4 * * *  (04:00 Lagos daily)
 *
 * Enforces data-retention policy from /legal/privacy:
 *   - Usage logs > 90 days → delete
 *   - KYC docs for closed accounts > 5 years → delete + evidence in audit
 *   - Transaction records > 7 years → archive to cold storage (not delete)
 *
 * Currently a STUB. The first slice to build is the 90-day AuditLog purge
 * (non-critical AuditLog entries like UI impressions, not security events).
 * Security-event AuditLog entries are retained indefinitely.
 */
import { logger } from '@frenzpay/logger';

export async function retentionSweep(): Promise<void> {
  logger.debug('[retention-sweep] stub — retention policy not yet enforced in code');
}
