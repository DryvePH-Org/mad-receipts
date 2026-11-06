#!/usr/bin/env bash
# ONE-TIME switch-over from the old name (mad-receipts) to MAD (mad-app) on the server:
# folder /opt/mad-receipts -> /opt/mad-app, container and image mad-receipts -> mad-app, the Caddy block, the cron file
# and the GitHub deploy key's forced command. The site keeps running on the old container until the new one is healthy;
# if anything fails before the old container is removed, everything is put back as it was.
#
# Run as root, once, after the new code is on main:
#   cd /opt/mad-receipts && git pull --ff-only && bash deploy/switch-to-mad-app.sh
set -euo pipefail
# Everything runs inside braces so bash has read the whole script before the folder is moved.
{
OLD=/opt/mad-receipts
NEW=/opt/mad-app
say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nSTOPPED: %s\n' "$*" >&2; exit 1; }

say "Checking (read-only)"
[ "$(id -u)" = 0 ] || die "Run this as root."
[ -d "$OLD/.git" ] || die "There is no app at $OLD. Nothing was changed."
[ ! -e "$NEW" ] || die "$NEW already exists. Nothing was changed."
cd "$OLD"
grep -q '^name: mad-app$' compose.yaml || die "This folder still has the old code. Run 'git pull --ff-only' first. Nothing was changed."
[ -f .env ] || die ".env is missing. Nothing was changed."

CADDY=$(docker ps --format '{{.Names}}' | while read -r n; do
  docker port "$n" 2>/dev/null | grep -q '^443/tcp' && echo "$n" && break
done || true)
[ -n "$CADDY" ] || die "Could not find the Caddy container. Nothing was changed."
CADDYFILE_SRC=$(docker inspect "$CADDY" --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}')
[ -f "$CADDYFILE_SRC" ] || die "Could not find the Caddyfile. Nothing was changed."
grep -q '# BEGIN mad-receipts' "$CADDYFILE_SRC" || die "The Caddyfile has no mad-receipts block. Nothing was changed."
echo "Caddy: $CADDY ($CADDYFILE_SRC)"

say "1/6 Building the new image (the site keeps running)"
docker compose build

say "2/6 Moving $OLD to $NEW"
mv "$OLD" "$NEW"
cd "$NEW"
undo_move() { docker compose down >/dev/null 2>&1 || true; cd /; mv "$NEW" "$OLD"; die "$1 The old setup is untouched and still serving the site."; }

say "3/6 Starting mad-app next to the old container"
docker compose up -d || undo_move "The new container did not start."
healthy() { [ "$(docker inspect -f '{{.State.Health.Status}}' mad-app 2>/dev/null)" = "healthy" ]; }
for _ in $(seq 1 45); do healthy && break; sleep 2; done
healthy || { docker logs --tail 30 mad-app >&2 || true; undo_move "The new container is not healthy."; }

say "4/6 Pointing Caddy at mad-app"
BACKUP="${CADDYFILE_SRC}.bak-$(date +%Y%m%d-%H%M%S)"
cp -p "$CADDYFILE_SRC" "$BACKUP"
echo "Backup: $BACKUP"
# Write in place (cat >) so the file Caddy has mounted stays the same file.
sed -e 's/# BEGIN mad-receipts/# BEGIN mad-app/' -e 's/# END mad-receipts/# END mad-app/' \
    -e 's/reverse_proxy mad-receipts:3000/reverse_proxy mad-app:3000/' "$BACKUP" > "$CADDYFILE_SRC.new"
cat "$CADDYFILE_SRC.new" > "$CADDYFILE_SRC" && rm -f "$CADDYFILE_SRC.new"
undo_caddy() { cat "$BACKUP" > "$CADDYFILE_SRC"; docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true; undo_move "$1 The Caddyfile was restored."; }
docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 || undo_caddy "Caddy says the new config is not valid."
docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile || undo_caddy "Caddy could not reload."

say "5/6 Removing the old container and image"
docker rm -f mad-receipts >/dev/null 2>&1 || true
docker network rm mad-receipts_default >/dev/null 2>&1 || true
docker image rm mad-receipts/app:latest mad-receipts/app:previous >/dev/null 2>&1 || true

say "6/6 Scheduled jobs and the deploy key"
rm -f /etc/cron.d/mad-receipts
sed "s|@DIR@|$NEW|g" deploy/crontab > /etc/cron.d/mad-app && chmod 644 /etc/cron.d/mad-app
if [ -f /root/.ssh/authorized_keys ]; then
  sed -i 's|/opt/mad-receipts/deploy/ci-deploy.sh|/opt/mad-app/deploy/ci-deploy.sh|g' /root/.ssh/authorized_keys
fi

echo
echo "Done. MAD runs from $NEW as container mad-app. Other projects:"
docker ps --format '  {{.Names}}\t{{.Status}}' | grep -v mad-app || true
exit 0
}
