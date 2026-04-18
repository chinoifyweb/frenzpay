#!/usr/bin/env bash
# 01-system-prep.sh — OS updates, timezone, swap, unattended-upgrades
# Run as root on fresh Hetzner VPS with CyberPanel installed.
set -euo pipefail

echo "▶ Setting timezone to UTC..."
timedatectl set-timezone UTC

echo "▶ Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

echo "▶ Installing essentials..."
apt-get install -y -qq \
  curl wget git unzip htop fail2ban ufw \
  build-essential software-properties-common \
  unattended-upgrades apt-listchanges \
  gpg gnupg2 ca-certificates

echo "▶ Configuring unattended-upgrades (security patches only)..."
cat > /etc/apt/apt.conf.d/20auto-upgrades <<EOF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

cat > /etc/apt/apt.conf.d/50unattended-upgrades <<EOF
Unattended-Upgrade::Allowed-Origins {
    "\${distro_id}:\${distro_codename}-security";
};
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Mail "security@frenzpay.co";
EOF

echo "▶ Configuring swap (4 GB)..."
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
  echo "Swap created."
else
  echo "Swap already exists, skipping."
fi

echo "▶ Increasing file descriptor limits for Node.js..."
cat >> /etc/security/limits.conf <<EOF
*    soft  nofile  65536
*    hard  nofile  65536
root soft  nofile  65536
root hard  nofile  65536
EOF

echo "✅ System prep complete."
