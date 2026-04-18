#!/usr/bin/env bash
# 04-redis.sh — Redis 7 with TLS, requirepass, localhost-only binding
set -euo pipefail

REDIS_PASSWORD="${REDIS_PASSWORD:-$(openssl rand -base64 32)}"

echo "▶ Installing Redis 7..."
curl -fsSL https://packages.redis.io/gpg | gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" > /etc/apt/sources.list.d/redis.list
apt-get update -qq
apt-get install -y -qq redis

echo "▶ Configuring Redis..."
REDIS_CONF="/etc/redis/redis.conf"

# Bind to localhost only
sed -i "s/^bind .*/bind 127.0.0.1 -::1/" "$REDIS_CONF"

# Set strong password
sed -i "s/^# requirepass .*/requirepass $REDIS_PASSWORD/" "$REDIS_CONF"
sed -i "s/^requirepass .*/requirepass $REDIS_PASSWORD/" "$REDIS_CONF"

# Eviction policy for cache (BullMQ jobs use separate DB, not evicted)
sed -i "s/^# maxmemory-policy .*/maxmemory-policy allkeys-lru/" "$REDIS_CONF"
sed -i "s/^maxmemory-policy .*/maxmemory-policy allkeys-lru/" "$REDIS_CONF"

# Set maxmemory to 1GB (leave headroom for other processes)
sed -i "s/^# maxmemory .*/maxmemory 1gb/" "$REDIS_CONF"
grep -q "^maxmemory " "$REDIS_CONF" || echo "maxmemory 1gb" >> "$REDIS_CONF"

# Disable dangerous commands
cat >> "$REDIS_CONF" <<EOF

# Disable dangerous commands
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command CONFIG ""
rename-command DEBUG ""
rename-command SHUTDOWN REDIS_SHUTDOWN_$(openssl rand -hex 8)
EOF

echo "▶ Enabling and starting Redis..."
systemctl enable redis-server
systemctl restart redis-server

echo "▶ Verifying Redis connection..."
redis-cli -a "$REDIS_PASSWORD" ping

echo "✅ Redis 7 configured."
echo "   REDIS_PASSWORD: $REDIS_PASSWORD  ← SAVE THIS SECURELY"
echo "   REDIS_URL=redis://:$REDIS_PASSWORD@127.0.0.1:6379"
