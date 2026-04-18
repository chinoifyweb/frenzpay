/**
 * Job: ongoing-screening
 * Schedule: 0 3 * * *  (03:00 Lagos daily)
 *
 * Re-checks all active users against the refreshed sanctions list from the
 * earlier sanctions-refresh job. Creates a SanctionsCheck row for each user
 * and flips User.kycStatus to SANCTIONS_HOLD on a positive hit.
 *
 * Currently a STUB. The schema (SanctionsCheck model) is already in place;
 * the runner just needs wiring once sanctions-refresh has data.
 */
import { logger } from '@frenzpay/logger';

export async function ongoingScreening(): Promise<void> {
  logger.debug('[ongoing-screening] stub — waiting on sanctions-refresh');
}
