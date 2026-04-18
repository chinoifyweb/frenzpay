#!/usr/bin/env bash
# 06-firewall.sh — ufw rules + fail2ban config
# Cloudflare is in front, so we only expose 80 + 443 externally.
# All internal ports (Postgres, Redis, Node) are localhost-only.
set -euo pipefail

echo "▶ Configuring ufw..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# SSH — restrict to your IP if known; otherwise leave open + fail2ban guards it
ufw allow 22/tcp comment "SSH"
# HTTP + HTTPS — Cloudflare proxy connects to these
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS"

# CyberPanel management — restrict to your office IP
# Uncomment and replace YOUR_IP:
# ufw allow from YOUR_IP to any port 8090 proto tcp comment "CyberPanel"

ufw --force enable
ufw status verbose

echo "▶ Configuring fail2ban for SSH..."
cat > /etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = ssh
logpath  = %(sshd_log)s
maxretry = 3
bantime  = 86400
EOF

systemctl enable fail2ban
systemctl restart fail2ban
fail2ban-client status

echo "✅ Firewall + fail2ban configured."
