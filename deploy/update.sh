#!/usr/bin/env bash
# Deploy the latest code: run as root on the server after every change you want live.
set -euo pipefail
APP=/opt/mad-receipts
cd "$APP"
sudo -u madapp git pull --ff-only
# The build reads /etc/mad-receipts.env through the .env.production.local link.
sudo -u madapp npm ci
sudo -u madapp npm run build
systemctl restart mad-receipts
sleep 4
curl -fsS -o /dev/null -w "app answered with HTTP %{http_code}\n" http://127.0.0.1:3000/login
