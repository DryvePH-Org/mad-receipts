#!/usr/bin/env bash
# Removes MAD from the server and restores the Caddyfile to how it was before.
# Usage: bash deploy/rollback.sh /path/to/Caddyfile.bak-YYYYMMDD-HHMMSS
set -euo pipefail
cd "$(dirname "$0")/.."
BACKUP="${1:?Give the Caddyfile backup path printed by vps-install.sh}"
CADDY=$(docker ps --format '{{.Names}}' | while read -r n; do docker port "$n" 2>/dev/null | grep -q '^443/tcp' && echo "$n" && break; done)
SRC=$(docker inspect "$CADDY" --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}')
cp -p "$BACKUP" "$SRC"
docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile
docker compose down
rm -f /etc/cron.d/mad-app
echo "MAD is stopped and the Caddyfile is restored. Its folder and .env are kept."
