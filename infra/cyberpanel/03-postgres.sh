#!/usr/bin/env bash
# 03-postgres.sh — PostgreSQL 16 + pgcrypto + TLS + frenzpay DB
set -euo pipefail

DB_NAME="${DB_NAME:-frenzpay_v3}"
DB_USER="${DB_USER:-frenzpay_app}"
# Generate a strong password if not provided
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 32)}"

echo "▶ Adding PostgreSQL 16 PGDG repo..."
apt-get install -y -qq curl ca-certificates
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
apt-get update -qq
apt-get install -y -qq postgresql-16 postgresql-contrib-16

echo "▶ Enabling and starting PostgreSQL..."
systemctl enable postgresql
systemctl start postgresql

echo "▶ Creating database and role..."
sudo -u postgres psql <<SQL
-- Create role
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASSWORD';
  END IF;
END \$\$;

-- Create database
SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER ENCODING UTF8 LC_COLLATE en_US.UTF-8 LC_CTYPE en_US.UTF-8'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;

-- Connect and enable extensions
\c $DB_NAME
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Grant schema usage to app role
GRANT USAGE ON SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
SQL

echo "▶ Configuring postgresql.conf (security + performance)..."
PG_CONF="/etc/postgresql/16/main/postgresql.conf"

# SSL — use self-signed for local connections; proper cert if exposing externally
# CyberPanel's Postgres should only accept local connections
sed -i "s/#ssl = off/ssl = on/" "$PG_CONF"
# Log DDL changes and slow queries (but NOT all queries — they contain PII)
sed -i "s/#log_statement = 'none'/log_statement = 'ddl'/" "$PG_CONF"
sed -i "s/#log_min_duration_statement = -1/log_min_duration_statement = 500/" "$PG_CONF"
# Disable logging all queries (would log PII!)
sed -i "s/log_statement = 'all'/log_statement = 'ddl'/" "$PG_CONF" 2>/dev/null || true

# Performance tuning for 8GB RAM (CPX31)
cat >> "$PG_CONF" <<EOF

# FrenzPay tuning (8 GB RAM CPX31)
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 10MB
max_connections = 100
EOF

echo "▶ Configuring pg_hba.conf (local only, TLS required)..."
PG_HBA="/etc/postgresql/16/main/pg_hba.conf"
cat > "$PG_HBA" <<EOF
# FrenzPay pg_hba.conf — local only
# TYPE  DATABASE        USER            ADDRESS         METHOD
local   all             postgres                        peer
local   all             all                             md5
hostssl $DB_NAME        $DB_USER        127.0.0.1/32    scram-sha-256
hostssl $DB_NAME        $DB_USER        ::1/128         scram-sha-256
EOF

echo "▶ Restarting PostgreSQL..."
systemctl restart postgresql

echo "✅ PostgreSQL 16 configured."
echo "   DB_NAME: $DB_NAME"
echo "   DB_USER: $DB_USER"
echo "   DB_PASSWORD: $DB_PASSWORD  ← SAVE THIS SECURELY"
echo ""
echo "   DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME?sslmode=require"
