#!/usr/bin/env bash
# Adds MAD Receipts to a VPS that already runs other Docker projects behind a Caddy container.
# It never touches the other projects' containers, volumes or data. Its only edit to anything shared is ONE
# site block in the Caddyfile, with a backup, a validity check before applying, and an automatic undo on failure.
#
# Run as root from /opt/mad-receipts:   DOMAIN=invoice.dryveph.io bash deploy/vps-install.sh
set -euo pipefail
: "${DOMAIN:?Set DOMAIN, e.g. DOMAIN=invoice.dryveph.io}"
cd "$(dirname "$0")/.."
say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nSTOPPED: %s\n' "$*" >&2; exit 1; }

say "1/7 Looking at what is already on this server (read-only)"
command -v docker >/dev/null || die "Docker is not installed."
docker compose version >/dev/null || die "Docker Compose is missing."
[ -f .env ] || die ".env is missing. Copy .env.example to .env and fill it in first."
grep -q '^CRON_SECRET=.\+' .env || die "CRON_SECRET is empty in .env."

# The container that owns port 443 is the shared receptionist.
CADDY=$(docker ps --format '{{.Names}}' | while read -r n; do
  docker port "$n" 2>/dev/null | grep -q '^443/tcp' && echo "$n" && break
done || true)
[ -n "$CADDY" ] || die "No running container publishes port 443, so I can't find the existing Caddy. Nothing was changed."
docker exec "$CADDY" caddy version >/dev/null 2>&1 || die "'$CADDY' owns port 443 but is not Caddy. Nothing was changed."
echo "Shared Caddy container: $CADDY"

CADDYFILE_SRC=$(docker inspect "$CADDY" --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}')
[ -n "$CADDYFILE_SRC" ] && [ -f "$CADDYFILE_SRC" ] || die "Could not find the Caddyfile on disk (mount of /etc/caddy/Caddyfile). Nothing was changed."
echo "Caddyfile on disk: $CADDYFILE_SRC"

NET=$(docker inspect "$CADDY" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | awk '{print $1}')
[ -n "$NET" ] || die "Could not find the Caddy container's network."
echo "Caddy's Docker network: $NET"

if grep -q "BEGIN mad-receipts" "$CADDYFILE_SRC"; then
  echo "The Caddyfile already has the MAD Receipts block; leaving it as is."
elif grep -Eq "^[[:space:]]*(https?://)?${DOMAIN//./\\.}[[:space:],{]" "$CADDYFILE_SRC"; then
  die "$DOMAIN is already used in the Caddyfile by something else. Nothing was changed."
fi

say "2/7 Memory and disk"
free -h | sed -n 1,2p
df -h / | tail -1
AVAIL_MB=$(free -m | awk '/Mem:/ {print $7}')
[ "$AVAIL_MB" -ge 1200 ] || die "Only ${AVAIL_MB} MB of memory is free. Not enough to add this app safely."

say "3/7 Saving settings and building the app (the other projects keep running)"
sed -i '/^PROXY_NETWORK=/d' .env && printf 'PROXY_NETWORK=%s\n' "$NET" >> .env
chmod 600 .env
docker compose build

say "4/7 Backing up the Caddyfile"
BACKUP="${CADDYFILE_SRC}.bak-$(date +%Y%m%d-%H%M%S)"
cp -p "$CADDYFILE_SRC" "$BACKUP"
echo "Backup: $BACKUP"

say "5/7 Starting the app (it publishes no ports)"
docker compose up -d
for i in $(seq 1 30); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' mad-receipts 2>/dev/null)" = "healthy" ] && break
  sleep 2
done
[ "$(docker inspect -f '{{.State.Health.Status}}' mad-receipts)" = "healthy" ] || { docker logs --tail 40 mad-receipts; die "The app did not become healthy. The Caddyfile was not changed."; }

say "6/7 Adding ONE site block to Caddy, checking it, then reloading without a restart"
if ! grep -q "BEGIN mad-receipts" "$CADDYFILE_SRC"; then
  {
    printf '\n# BEGIN mad-receipts (added by deploy/vps-install.sh; delete these lines to remove)\n'
    printf '%s {\n\tencode zstd gzip\n\trequest_body {\n\t\tmax_size 12MB\n\t}\n\treverse_proxy mad-receipts:3000\n}\n' "$DOMAIN"
    printf '# END mad-receipts\n'
  } >> "$CADDYFILE_SRC"
fi
undo() { cp -p "$BACKUP" "$CADDYFILE_SRC"; docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true; die "$1 The Caddyfile was restored from the backup."; }
docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 || undo "Caddy says the new config is not valid."
docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile || undo "Caddy could not reload."

say "7/7 Scheduled jobs (host cron) and checks"
cat > /etc/cron.d/mad-receipts <<CRON
# Background sync every 5 minutes; balance reminder daily at 8:00 AM Manila time (00:00 UTC).
CRON_TZ=UTC
*/5 * * * * root $PWD/deploy/run-cron.sh /api/sync/run
0 0 * * * root $PWD/deploy/run-cron.sh /api/reminders/run
CRON
chmod 644 /etc/cron.d/mad-receipts

echo; echo "Other projects still running:"
docker ps --format '  {{.Names}}\t{{.Status}}' | grep -v mad-receipts || true
echo
echo "Done. Give HTTPS a minute to be issued, then open https://$DOMAIN"
echo "To undo the Caddy change: cp -p $BACKUP $CADDYFILE_SRC && docker exec $CADDY caddy reload --config /etc/caddy/Caddyfile"
