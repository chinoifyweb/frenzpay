#!/usr/bin/env bash
# 02-node-pm2.sh — Install Node.js 22 (via nvm), pnpm, PM2
set -euo pipefail

NODE_VERSION="22"
DEPLOY_USER="${DEPLOY_USER:-user}"

echo "▶ Installing nvm..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Load nvm
export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "▶ Installing Node.js $NODE_VERSION LTS..."
nvm install "$NODE_VERSION"
nvm alias default "$NODE_VERSION"
nvm use "$NODE_VERSION"

echo "▶ Installing pnpm globally..."
npm install -g pnpm@latest

echo "▶ Installing PM2 globally..."
npm install -g pm2

echo "▶ Setting up PM2 as a systemd service..."
pm2 startup systemd -u "$DEPLOY_USER" --hp "/home/$DEPLOY_USER"
systemctl enable pm2-"$DEPLOY_USER"

echo "▶ Creating PM2 log directory..."
mkdir -p /var/log/pm2
chown "$DEPLOY_USER:$DEPLOY_USER" /var/log/pm2

echo "▶ Installing PM2 log rotation..."
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true

echo "✅ Node.js $(node --version), pnpm $(pnpm --version), PM2 $(pm2 --version) installed."
