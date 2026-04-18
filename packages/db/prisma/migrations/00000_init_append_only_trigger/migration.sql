-- Migration: enforce append-only constraints on audit tables
-- This runs AFTER prisma migrate creates the tables.

-- 1. Block UPDATE/DELETE on ledger_entries (immutable financial records)
CREATE OR REPLACE FUNCTION prevent_ledger_entry_mutation()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'ledger_entries is immutable — UPDATE and DELETE are prohibited. '
    'Create a reversal entry instead. (Attempted % on row %)', TG_OP, OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS no_ledger_entry_mutation ON ledger_entries;
CREATE TRIGGER no_ledger_entry_mutation
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_entry_mutation();

-- 2. Block UPDATE/DELETE on admin_audit_logs (compliance requirement)
CREATE OR REPLACE FUNCTION prevent_admin_audit_log_mutation()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'admin_audit_logs is append-only — UPDATE and DELETE are prohibited. '
    '(Attempted % on row %)', TG_OP, OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS no_admin_audit_log_mutation ON admin_audit_logs;
CREATE TRIGGER no_admin_audit_log_mutation
  BEFORE UPDATE OR DELETE ON admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_log_mutation();

-- 3. Block UPDATE/DELETE on audit_logs
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'audit_logs is append-only — UPDATE and DELETE are prohibited. '
    '(Attempted % on row %)', TG_OP, OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS no_audit_log_mutation ON audit_logs;
CREATE TRIGGER no_audit_log_mutation
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- 4. Index for fast balance derivation (SUM on account_id)
CREATE INDEX IF NOT EXISTS idx_ledger_debit_currency
  ON ledger_entries(debit_account_id, currency, created_at);

CREATE INDEX IF NOT EXISTS idx_ledger_credit_currency
  ON ledger_entries(credit_account_id, currency, created_at);
