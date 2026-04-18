#!/usr/bin/env bash
# FrenzPay healthcheck — returns 0 if web is up, 1 otherwise.
# Used by monitoring cron, systemd timers, and manually by ops.
set -euo pipefail

URL=${FRENZPAY_HEALTH_URL:-http://127.0.0.1:3200/api/health}

if curl -fsS --max-time 5 "$URL" >/dev/null 2>&1; then
  echo "OK"
  exit 0
else
  echo "FAIL"
  exit 1
fi
