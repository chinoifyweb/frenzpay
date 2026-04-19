/**
 * PM2 ecosystem config for FrenzPay.
 *
 * Two processes:
 *   - frenzpay-web     : Next.js standalone server, 2 cluster workers on 127.0.0.1:3000
 *   - frenzpay-worker  : node-cron scheduler (see apps/web/src/workers/cron.ts)
 *
 * Deployment layout (atomic releases):
 *   /home/frenzpay/
 *     app        -> symlink to the current release (what this config points at)
 *     releases/  -> timestamped directories, each a full unpacked build
 *     shared/    -> .env.production + logs + any persistent files
 *
 * Secrets:
 *   Read from /home/frenzpay/shared/.env.production via `node --env-file=...`
 *   passed in the deploy script. If INFISICAL_TOKEN is set, a small preload
 *   script swaps to fetch-from-Infisical instead (see `scripts/env-source.js`).
 *
 * Usage:
 *   pm2 start  /home/frenzpay/ecosystem.config.js
 *   pm2 reload /home/frenzpay/ecosystem.config.js --update-env   # zero-downtime deploy
 *   pm2 save                                                     # persist for boot
 */

const path = require('node:path');

// Standalone output is nested because this is a pnpm monorepo.
// `apps/web/.next/standalone/apps/web/server.js` is where Next.js emits it.
const RELEASE_ROOT = process.env.FRENZPAY_RELEASE_ROOT || '/home/frenzpay/app';
const STANDALONE_BASE = path.join(RELEASE_ROOT, 'apps/web/.next/standalone/apps/web');
const LOG_DIR = process.env.FRENZPAY_LOG_DIR || '/home/frenzpay/shared/logs';

module.exports = {
  apps: [
    {
      name: 'frenzpay-web',
      script: path.join(STANDALONE_BASE, 'server.js'),
      cwd: STANDALONE_BASE,
      instances: 2,
      exec_mode: 'cluster',
      wait_ready: true,
      listen_timeout: 30000,
      kill_timeout: 10000,
      max_memory_restart: '800M',
      node_args: '--enable-source-maps',
      env: {
        NODE_ENV: 'production',
        PORT: 3200,     // 3000 is claimed by nghttpx (CyberPanel HTTP/2 proxy)
        HOSTNAME: '127.0.0.1',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: path.join(LOG_DIR, 'web-error.log'),
      out_file: path.join(LOG_DIR, 'web-out.log'),
      merge_logs: true,
      time: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
    {
      name: 'frenzpay-worker',
      script: path.join(STANDALONE_BASE, 'workers/cron.mjs'),
      cwd: STANDALONE_BASE,
      instances: 1,
      exec_mode: 'fork',
      wait_ready: true,
      listen_timeout: 15000,
      kill_timeout: 30000, // jobs get up to 25s to finish (see cron.ts shutdown)
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: path.join(LOG_DIR, 'worker-error.log'),
      out_file: path.join(LOG_DIR, 'worker-out.log'),
      merge_logs: true,
      time: true,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 1000,
    },
  ],
};
