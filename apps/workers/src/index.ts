/**
 * FrenzPay BullMQ Worker Process
 * Processes: webhooks, payouts, reconciliation, notifications, savings lock maturity
 *
 * This process is separate from the Next.js app — it runs as a long-lived PM2 process.
 */
import { logger } from '@frenzpay/logger'

// TODO Phase 4: import queue workers
// import { startBridgeWebhookWorker } from './workers/bridge-webhook.js'
// import { startFlutterwaveWorker } from './workers/flutterwave.js'
// import { startNotificationWorker } from './workers/notifications.js'
// import { startSavingsMaturityWorker } from './workers/savings-maturity.js'
// import { startReconciliationWorker } from './workers/reconciliation.js'

async function main() {
  logger.info('FrenzPay workers starting...')

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received — shutting down workers gracefully...')
    // TODO: close all workers cleanly
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    logger.info('SIGINT received — shutting down workers gracefully...')
    process.exit(0)
  })

  logger.info('Workers ready. Queue implementations coming in Phase 4+.')
}

main().catch((err) => {
  logger.error({ err }, 'Workers startup failed')
  process.exit(1)
})
