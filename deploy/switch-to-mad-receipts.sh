#!/usr/bin/env bash
# Puts the server back to the original names: folder /opt/mad-app -> /opt/mad-receipts, container and image
# mad-app -> mad-receipts, the Caddy block, the cron file and the GitHub deploy key's forced command.
# (The reverse of the one-time switch that renamed everything to "mad-app".) The site keeps running on the current
# container until the new one is healthy; if anything fails before the old container is removed, everything is put back.
#
# Run as root, once, after the restored code is on main:
#   cd /opt/mad-app && git pull --ff-only && bash deploy/switch-to-mad-receipts.sh
set -euo pipefail
# Everything runs inside braces so bash has read the whole script before the folder is moved.
{
OLD=/opt/mad-app
NEW=/opt/mad-receipts
say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nSTOPPED: %s\n' "$*" >&2; exit 1; }

say "Checking (read-only)"
[ "$(id -u)" = 0 ] || die "Run this as root."
[ -d "$OLD/.git" ] || die "There is no app at $OLD. Nothing was changed."
[ ! -e "$NEW" ] || die "$NEW already exists. Nothing was changed."
cd "$OLD"
grep -q '^name: mad-receipts$' compose.yaml || die "This folder still has the mad-app code. Run 'git pull --ff-only' first. Nothing was changed."
[ -f .env ] || die ".env is missing. Nothing was changed."

CADDY=$(docker ps --format '{{.Names}}' | while read -r n; do
  docker port "$n" 2>/dev/null | grep -q '^443/tcp' && echo "$n" && break
done || true)
[ -n "$CADDY" ] || die "Could not find the Caddy container. Nothing was changed."
CADDYFILE_SRC=$(docker inspect "$CADDY" --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}')
[ -f "$CADDYFILE_SRC" ] || die "Could not find the Caddyfile. Nothing was changed."
grep -q '# BEGIN mad-app' "$CADDYFILE_SRC" || die "The Caddyfile has no mad-app block. Nothing was changed."
echo "Caddy: $CADDY ($CADDYFILE_SRC)"

say "1/6 Building the image under the original name (the site keeps running)"
docker compose build

say "2/6 Moving $OLD to $NEW"
mv "$OLD" "$NEW"
cd "$NEW"
undo_move() { docker compose down >/dev/null 2>&1 || true; cd /; mv "$NEW" "$OLD"; die "$1 The current setup is untouched and still serving the site."; }

say "3/6 Starting mad-receipts next to the current container"
docker compose up -d || undo_move "The new container did not start."
healthy() { [ "$(docker inspect -f '{{.State.Health.Status}}' mad-receipts 2>/dev/null)" = "healthy" ]; }
for _ in $(seq 1 45); do healthy && break; sleep 2; done
healthy || { docker logs --tail 30 mad-receipts >&2 || true; undo_move "The new container is not healthy."; }

say "4/6 Pointing Caddy at mad-receipts"
BACKUP="${CADDYFILE_SRC}.bak-$(date +%Y%m%d-%H%M%S)"
cp -p "$CADDYFILE_SRC" "$BACKUP"
echo "Backup: $BACKUP"
# Write in place (cat >) so the file Caddy has mounted stays the same file.
sed -e 's/# BEGIN mad-app/# BEGIN mad-receipts/' -e 's/# END mad-app/# END mad-receipts/' \
    -e 's/reverse_proxy mad-app:3000/reverse_proxy mad-receipts:3000/' "$BACKUP" > "$CADDYFILE_SRC.new"
cat "$CADDYFILE_SRC.new" > "$CADDYFILE_SRC" && rm -f "$CADDYFILE_SRC.new"
undo_caddy() { cat "$BACKUP" > "$CADDYFILE_SRC"; docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true; undo_move "$1 The Caddyfile was restored."; }
docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 || undo_caddy "Caddy says the new config is not valid."
docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile || undo_caddy "Caddy could not reload."

say "5/6 Removing the mad-app container and image"
docker rm -f mad-app >/dev/null 2>&1 || true
docker network rm mad-app_default >/dev/null 2>&1 || true
docker image rm mad-app/app:latest mad-app/app:previous >/dev/null 2>&1 || true

say "6/6 Scheduled jobs and the deploy key"
rm -f /etc/cron.d/mad-app
cat > /etc/cron.d/mad-receipts <<CRON
# Background sync every 5 minutes; balance reminder daily at 8:00 AM Manila time (00:00 UTC).
CRON_TZ=UTC
*/5 * * * * root $NEW/deploy/run-cron.sh /api/sync/run
0 0 * * * root $NEW/deploy/run-cron.sh /api/reminders/run
CRON
chmod 644 /etc/cron.d/mad-receipts
if [ -f /root/.ssh/authorized_keys ]; then
  sed -i 's|/opt/mad-app/deploy/ci-deploy.sh|/opt/mad-receipts/deploy/ci-deploy.sh|g' /root/.ssh/authorized_keys
fi

echo
echo "Done. MAD Receipts runs from $NEW as container mad-receipts. Other projects:"
docker ps --format '  {{.Names}}\t{{.Status}}' | grep -v mad-receipts || true
exit 0
}
