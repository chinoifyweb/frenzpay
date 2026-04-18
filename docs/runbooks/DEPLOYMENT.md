# FrenzPay Deployment Runbook

FrenzPay runs self-hosted on a Hetzner VPS (shared with other Frenz services).
This runbook covers how the app is deployed, rolled back, monitored, and
recovered.

---

## Architecture

```
Internet
  │
  ▼
Cloudflare  (DNS + WAF + CDN, proxied)
  │
  ▼
Hetzner 16 GB   (Ubuntu 24.04 + CyberPanel)
  │
  ├─ OpenLiteSpeed (CyberPanel vhosts)
  │   ├─ app.frenzpay.co   → proxy to 127.0.0.1:3000 (new FrenzPay — PM2 cluster)
  │   ├─ frenzpay.co       → legacy FrenzPay deploy (kept during cutover)
  │   └─ (other Frenz sites unchanged)
  │
  ├─ PM2  (running as frenzpay user)
  │   ├─ frenzpay-web     — Next.js standalone, 2 cluster workers, port 3000
  │   └─ frenzpay-worker  — node-cron scheduled jobs
  │
  ├─ PostgreSQL   localhost:5432   (database: frenzpay_v3, user: frenzpay_app)
  ├─ Redis        localhost:6379
  └─ MinIO        localhost:9000   (KYC document storage)
```

Everything FrenzPay talks to is on `127.0.0.1`. Cloudflare is the only public
entry point; ufw restricts ports 80/443 to Cloudflare IPs.

---

## Server layout

```
/home/frenzpay/
├── app/                        → symlink to current release
├── releases/
│   ├── 20260418T120000/       ← each deploy is a timestamped dir (UTC)
│   ├── 20260418T141800/
│   └── 20260419T090200/       ← current
├── shared/
│   ├── .env.production         ← secrets, symlinked into every release
│   ├── logs/                   ← PM2 writes here
│   ├── backups/                ← daily pg_dumps
│   └── uploads/
├── scripts/
│   ├── deploy.sh
│   ├── rollback.sh
│   ├── healthcheck.sh
│   └── backup.sh
└── ecosystem.config.js         ← PM2 config, points to app/
```

Runtime user: `frenzpay` (system account, `/bin/bash` shell for CI deploys,
no interactive login password).

---

## Deploy

### Automatic (preferred)

```
git push origin main
```

GitHub Actions (`.github/workflows/deploy.yml`) runs:

1. `pnpm install` + `pnpm test:unit`
2. `pnpm --filter @frenzpay/db prisma generate`
3. `pnpm --filter @frenzpay/web build`
4. Packages `.next/standalone` + static + public + prisma + scripts into `frenzpay-release.tar.gz`
5. SCPs tarball + scripts + ecosystem to the server
6. Runs `scripts/deploy.sh` over SSH as the `frenzpay` user

**To run migrations as part of deploy:** go to Actions → Deploy FrenzPay → Run workflow → set `run_migrations` to `true`. Default is `false` to avoid surprise schema changes.

### Manual (for debugging)

From your laptop:

```
pnpm install
pnpm test:unit
pnpm --filter @frenzpay/db prisma generate
pnpm --filter @frenzpay/web build

# package (same commands as CI)
tar -czf frenzpay-release.tar.gz \
  apps/web/.next/standalone \
  apps/web/.next/static \
  apps/web/public \
  packages/db/prisma \
  ecosystem.config.js \
  scripts

# ship
scp frenzpay-release.tar.gz frenzpay@<host>:/tmp/
ssh frenzpay@<host> bash /home/frenzpay/scripts/deploy.sh
```

---

## Rollback

Atomic — swaps the `app` symlink to the previous release and reloads PM2.

```
ssh frenzpay@<host> bash /home/frenzpay/scripts/rollback.sh
```

Works as long as `releases/` still has the previous directory (default: keep 5).

---

## Healthcheck

```
# On server
bash /home/frenzpay/scripts/healthcheck.sh

# Remote
curl -fsS https://app.frenzpay.co/api/health
```

Returns HTTP 200 with `{ status: "ok" }` when DB + Redis are reachable.
Returns 503 with `{ status: "error" }` if either is down.

---

## Logs

```
ssh frenzpay@<host>

# Web process logs
pm2 logs frenzpay-web --lines 200

# Worker / cron logs
pm2 logs frenzpay-worker --lines 200

# Log files directly
tail -f /home/frenzpay/shared/logs/web-out.log
tail -f /home/frenzpay/shared/logs/web-error.log

# OpenLiteSpeed access/error
tail -f /usr/local/lsws/logs/access.log
tail -f /usr/local/lsws/logs/error.log
```

---

## Common operations

| Task | Command |
|------|---------|
| Restart web | `pm2 restart frenzpay-web` |
| Restart worker | `pm2 restart frenzpay-worker` |
| Full status | `pm2 status` |
| Real-time monit | `pm2 monit` |
| Stop all | `pm2 stop all` |
| View envs PM2 sees | `pm2 env <pid>` |
| Reload OLS | `/usr/local/lsws/bin/lswsctrl restart` |
| Trigger a cron job manually | `node /home/frenzpay/app/apps/web/.next/standalone/apps/web/workers/cron.js` (⚠ runs the full scheduler — don't do on production) |

---

## Environment variables

All secrets live in `/home/frenzpay/shared/.env.production` (mode `600`, owner
`frenzpay:frenzpay`).

Reference: `.env.example` in the repo root.

To update:

```
ssh frenzpay@<host>
sudo -u frenzpay nano /home/frenzpay/shared/.env.production
pm2 reload ecosystem.config.js --update-env
```

Changes take effect on next PM2 reload. No restart needed — cluster workers
reload one at a time.

---

## On-call runbook — site is down

1. **Check from the outside**
   ```
   curl -I https://app.frenzpay.co/api/health
   ```

2. **SSH in and check PM2**
   ```
   ssh root@<host>
   sudo -u frenzpay pm2 status
   ```
   All three processes should be `online`. If one is `errored` or `stopped`:
   ```
   sudo -u frenzpay pm2 logs frenzpay-web --lines 100
   ```

3. **Check dependencies**
   ```
   systemctl is-active postgresql
   systemctl is-active redis-server
   systemctl is-active lsws
   ```

4. **Check health endpoint from inside**
   ```
   curl http://127.0.0.1:3000/api/health
   ```
   If 200 from localhost but failing externally → OLS or Cloudflare.
   If 503 from localhost → check DB/Redis. `/api/health` returns the specific failing dependency in the `checks` object.

5. **If everything looks fine but traffic's getting 5xx** → check OLS:
   ```
   tail -100 /usr/local/lsws/logs/error.log
   ```

6. **Rollback if deploy caused it**
   ```
   sudo -u frenzpay bash /home/frenzpay/scripts/rollback.sh
   ```

7. **Escalate**: if rollback doesn't fix it, change Cloudflare DNS back to the legacy `frenzpay.co` origin to buy time while investigating.

---

## Backups

Daily pg_dump → Backblaze B2 via systemd timer:

```
sudo systemctl status frenzpay-backup.timer
sudo systemctl list-timers | grep frenzpay
```

Last 7 dumps kept locally in `/home/frenzpay/shared/backups/`.
Remote retention (B2 lifecycle rule): 30 days.

Test restore quarterly to a scratch database named `frenzpay_scratch`.

---

## Scaling up (when we outgrow this box)

1. Bump Hetzner plan (CX42 → CX52 → CCX)
2. Split verification-engine to its own small box (already HTTP-decoupled)
3. Move Postgres to a dedicated DB box with streaming replication
4. Second Next.js box behind HAProxy/Caddy

None of these require rewriting application code.

---

## Never do

- Don't run `prisma migrate reset` on production
- Don't run PM2 as root
- Don't put secrets in `ecosystem.config.js` — always in `.env.production`
- Don't expose Postgres, Redis, MinIO, or the verification engine to the public internet
- Don't decommission an old deploy until the new one has been stable for at least 7 days
- Don't deploy during peak user hours for the first few production deploys after any big refactor
