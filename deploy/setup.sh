#!/usr/bin/env bash
# One-time setup on a fresh Ubuntu 22.04/24.04 VPS. Run as root:
#   curl -fsSL https://raw.githubusercontent.com/DryvePH-Org/mad-receipts/main/deploy/setup.sh | DOMAIN=receipts.example.com bash
# DOMAIN is the address staff will open. It must already point at this server (an A record).
set -euo pipefail
: "${DOMAIN:?Set DOMAIN, e.g. DOMAIN=receipts.example.com}"
REPO="${REPO:-https://github.com/DryvePH-Org/mad-receipts.git}"
APP=/opt/mad-receipts

apt-get update -y
apt-get install -y curl git ca-certificates debian-keyring debian-archive-keyring apt-transport-https gpg ufw

# Node 22
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Caddy: HTTPS certificates are issued and renewed automatically.
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

id -u madapp >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin madapp
[ -d "$APP/.git" ] || git clone "$REPO" "$APP"
chown -R madapp:madapp "$APP"

# Secrets live outside the repository. Fill it in, then run deploy/update.sh.
if [ ! -f /etc/mad-receipts.env ]; then
  cp "$APP/.env.example" /etc/mad-receipts.env
  echo "CRON_SECRET=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40)" >> /etc/mad-receipts.env
fi
chown root:madapp /etc/mad-receipts.env && chmod 640 /etc/mad-receipts.env
# Next.js reads this file itself, at build time and at run time.
ln -sf /etc/mad-receipts.env "$APP/.env.production.local"

cp "$APP/deploy/mad-receipts.service" /etc/systemd/system/mad-receipts.service
sed "s/DOMAIN/$DOMAIN/g" "$APP/deploy/Caddyfile" > /etc/caddy/Caddyfile
cp "$APP/deploy/cron" /etc/cron.d/mad-receipts && chmod 644 /etc/cron.d/mad-receipts
systemctl daemon-reload && systemctl enable mad-receipts && systemctl reload caddy || systemctl restart caddy

ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

echo
echo "Next: edit /etc/mad-receipts.env (add your keys), then run: bash $APP/deploy/update.sh"
