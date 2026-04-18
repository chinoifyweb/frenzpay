/**
 * Job: sanctions-refresh
 * Schedule: 0 2 * * *  (02:00 Lagos daily)
 *
 * Fetches the latest OpenSanctions FtM JSON, diffs against the last cached
 * copy, and stores new entities for the ongoing-screening job to run against.
 *
 * Currently a STUB. Wire up when the sanctions screening feature lands —
 * see `OPENSANCTIONS_DATA_URL` in `.env.example`.
 */
import { logger } from '@frenzpay/logger';

export async function sanctionsRefresh(): Promise<void> {
  logger.debug('[sanctions-refresh] stub — feature not yet built');
}
