# FrenzPay Runbooks

Operational runbooks for production incidents.

## Index

| Runbook | When to use |
|---------|-------------|
| [bridge-webhook-outage.md](bridge-webhook-outage.md) | Bridge webhooks not arriving or failing |
| [flutterwave-payout-stuck.md](flutterwave-payout-stuck.md) | NGN withdrawal stuck in PROCESSING |
| [ledger-reconciliation-drift.md](ledger-reconciliation-drift.md) | Nightly reconciliation drift > $0.01 alert |
| [customer-claims-missing-funds.md](customer-claims-missing-funds.md) | Customer reports money missing |
| [database-restore.md](database-restore.md) | Restoring from backup |
| [ddos-mitigation.md](ddos-mitigation.md) | Under active DDoS attack |

## Incident Severity

| Level | Definition | Response |
|-------|-----------|----------|
| P0 | Funds at risk, data breach, total outage | Immediate all-hands, CEO notified |
| P1 | Core feature broken (deposits/withdrawals failing) | On-call within 30min |
| P2 | Degraded experience, partial functionality | Business hours response |
| P3 | Minor bug, cosmetic issue | Next sprint |

All incidents documented in `docs/incidents/INCIDENT_LOG.md`.
