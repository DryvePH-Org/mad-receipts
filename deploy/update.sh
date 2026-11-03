#!/usr/bin/env bash
# Deploy the latest code. Run as root in /opt/mad-receipts. Touches only the mad-receipts project.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose build
docker compose up -d
sleep 8
docker ps --filter name=mad-receipts --format '{{.Names}}: {{.Status}}'
