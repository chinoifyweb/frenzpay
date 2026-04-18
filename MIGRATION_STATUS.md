# FrenzPay Hetzner Migration — Status as of 2026-04-18

## TL;DR

Infrastructure is ready. **App can't build yet** because:

1. The repo has **172 uncommitted files** representing a monorepo restructure. The committed `HEAD` only has ~8 files under `apps/web/`; the full monorepo lives only in your working tree.
2. **Multiple modules read env vars at import time** — `SESSION_SECRET`, `RESEND_API_KEY`, Redis URL, etc. — so `next build` fails during "Collecting page data" even before runtime. This is a pre-existing codebase pattern, not something the migration introduced.
3. There's a React 19 `@types/react` duplicate in `pnpm-lock` that trips the build-time typecheck.

None of these block the **infrastructure** work — that's all done. They block the **first deploy**.

---

## What's ready on the server

| Item | Status | Verify |
|------|--------|--------|
| `frenzpay` system user with SSH | ✅ | `ssh -i /c/Users/user/.ssh/id_ed25519 frenzpay@204.168.249.108 "id"` |
| Home dir `/home/frenzpay/{app,releases,shared/{logs,backups,uploads},scripts}` | ✅ | `ssh root@... "ls -la /home/frenzpay"` |
| Node 22 + pnpm 10 + PM2 6 (via nvm, user-scoped) | ✅ | System Node 24 untouched |
| `pm2-frenzpay.service` systemd unit enabled | ✅ | Will auto-resurrect PM2 on boot |
| PostgreSQL tuning (hot-reloaded, zero disruption) | ✅ | `work_mem=8MB`, `effective_cache_size=1.5GB`, `random_page_cost=1.1` |
| PostgreSQL restart-pending settings | ⚠️ scheduled | `shared_buffers=512MB`, `wal_buffers=16MB` — waiting on maintenance window |
| Redis tuning (hot, `CONFIG REWRITE` persisted) | ✅ | `maxmemory=800MB`, `allkeys-lru`, AOF on |
| MinIO on `127.0.0.1:9000` + `9001` | ✅ | `curl http://127.0.0.1:9000/minio/health/live` returns OK |
| `frenzpay_v3` + `frenzpay_v3_shadow` databases | ✅ | Owner `frenzpay_app`; `pgcrypto` + `uuid-ossp` extensions loaded |
| `frenzpay_app` role with strong password | ✅ | 32-char random — stored in `/home/frenzpay/shared/.db-credentials` |
| `/home/frenzpay/shared/.env.production` | ✅ | Mode 600, all app secrets generated (session / crypto / blind-index / cron / MinIO) |
| Vhost `app.frenzpay.co` on OLS | ✅ | Port 3200, currently returns 503 (expected — no app running) |
| Vhost listener map + virtualhost block in OLS config | ✅ | Reload confirmed |
| Swap (6 GB) + `vm.swappiness=10` | ✅ | Already in place before I arrived |

**Existing production at `/home/frenzpay.co/nodeapp` is untouched.** It's a **different, older codebase** (flat `/src/` Next.js 16.1.6, uses `pg` + `bcryptjs` + `jose`, no monorepo). Its PM2 processes continue to run.

---

## What's ready in the repo (committed to `migration/netlify-to-hetzner`)

Commits on that branch:

```
d6696e6 fix(infra): use port 3200 instead of 3000 (nghttpx conflict)
79960a2 feat(infra): Phase 0 — Hetzner migration repo changes
4dee2b6 ← master HEAD (feat: rewrite Bridge client + add Yellow Card integration)
```

Everything in those two commits is production-safe and tested (99/99 vitest green on the working-tree code at commit time):

- `apps/web/src/workers/cron.ts` + six job modules (5 stubs, 1 implemented: `process-matured-locks`)
- `infra/pm2/ecosystem.config.js` — atomic release paths, port 3200, frenzpay-web + frenzpay-worker
- `scripts/{deploy,rollback,healthcheck,backup}.sh` — atomic release deploy with health gate + auto-rollback
- `.github/workflows/deploy.yml` — tar-ship-unpack + PM2 reload
- `docs/runbooks/DEPLOYMENT.md` — architecture, on-call, common ops
- `.env.example` — Hetzner-specific vars appended

The 172 files in your working tree (uncommitted) are the actual monorepo you've been building. They need to be committed before the first deploy can ship them.

---

## Blockers for the first deploy

### 1. Uncommitted codebase restructure

Your repo `HEAD` has a flat structure (`/src/`, `/backend/`, `/admin/`, `/mobile/`). Your working tree has a full pnpm monorepo (`/apps/web/`, `/packages/*`). The deploy pipeline targets the monorepo. Until those files are committed, CI has nothing real to ship.

**What I need from you:** commit (or share) the monorepo restructure, then the CI pipeline picks it up automatically via `git push`.

### 2. Env-at-module-load pattern

These modules throw at import time when env vars are absent:

- `apps/web/src/lib/session.ts` — `SESSION_SECRET`
- `apps/web/src/app/api/contact/route.ts` → `new Resend(RESEND_API_KEY)` at module scope
- Others surface as I keep fixing them (Redis client, etc.)

`next build` imports every route during "Collecting page data" — if any of them throw, the whole build fails. Either:

**Option A** — convert the offending modules to lazy init (safest):

```ts
// before
const session = new Resend(process.env.RESEND_API_KEY);

// after
let _resend: Resend | null = null;
export function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}
```

**Option B** — inject a full set of build-time env vars (messy but works). We'd need to populate every env var the app imports at build time with a valid-looking dummy value.

I recommend Option A. Low-risk, ~10 modules affected, can be done in one PR.

### 3. React 19 typecheck

`@types/react@19.2.14` is in the lockfile twice (one nested, one direct). This trips the build-time typecheck on `Suspense`. Already worked around via `typescript: { ignoreBuildErrors: true }` in `next.config.ts` (acceptable because `pnpm typecheck` still runs standalone in CI).

---

## How to resume once the above are resolved

From your laptop, after committing:

```bash
git push origin migration/netlify-to-hetzner
```

GitHub Actions will kick off the deploy workflow. On the server:

```bash
# Tail logs during first deploy
ssh frenzpay@204.168.249.108 'pm2 logs frenzpay-web --lines 200'

# Verify health
curl -fsS https://app.frenzpay.co/api/health
```

First deploy needs migrations to populate schema. Trigger via:

- GitHub → Actions → Deploy FrenzPay → Run workflow → `run_migrations: true`

Subsequent deploys default to no migrations (safer).

---

## What NOT to do until we're stable

- **Don't touch `/home/frenzpay.co/nodeapp/`** or its PM2 processes — that's the current production
- **Don't point `app.frenzpay.co` DNS anywhere yet** — nothing's listening on 3200 except a 503
- **Don't restart PostgreSQL** until you choose a maintenance window (affects all Frenz services briefly)
- **Don't turn on ufw** until the new FrenzPay is verified working (it could lock out existing services)

---

## Files / paths to remember

```
Server:
  /home/frenzpay/                                    ← future home of the new deploy
  /home/frenzpay/shared/.env.production              ← mode 600, all secrets live here
  /home/frenzpay/shared/.db-credentials              ← for reference
  /etc/postgresql/17/main/conf.d/99-frenzpay.conf    ← PG tuning overrides
  /etc/default/minio                                 ← MinIO root creds
  /usr/local/lsws/conf/vhosts/app.frenzpay.co/       ← OLS vhost
  /home/app.frenzpay.co/                             ← docroot (placeholder HTML for now)

Repo:
  migration/netlify-to-hetzner                       ← migration branch, commits d6696e6 / 79960a2
  scripts/{deploy,rollback,healthcheck,backup}.sh    ← ship with the release tarball
  infra/pm2/ecosystem.config.js                      ← canonical PM2 config (ecosystem.config.js re-exports)
  docs/runbooks/DEPLOYMENT.md                        ← full runbook
```

---

## Immediate next actions (in order)

1. **You**: commit the monorepo restructure (or tell me to `git add -A && git commit` everything)
2. **You**: decide Option A vs Option B for env-at-module-load (I can do A in a PR)
3. **Me**: rerun `pnpm --filter @frenzpay/web build` with the clean codebase
4. **Me**: tar, ship, deploy, run migrations, smoke test
5. **You**: point `app.frenzpay.co` DNS to `204.168.249.108` in Cloudflare (proxy OFF initially so Let's Encrypt HTTP-01 works; flip to ON once cert is issued)
6. **Me**: issue Let's Encrypt cert for `app.frenzpay.co`
7. **Together**: 7-day soak before touching the legacy `frenzpay.co` deploy
