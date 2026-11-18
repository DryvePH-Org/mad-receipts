#!/usr/bin/env bash
# Changes the address MAD Receipts is served at. Its ONLY edit to anything shared is the MAD Receipts site block in the shared
# Caddyfile (the lines between "# BEGIN mad-receipts" and "# END mad-receipts"), with a backup, a validity check before it is applied,
# and an automatic undo if Caddy rejects it. Other projects' blocks, containers and data are never touched.
#
#   NEW=mad.dryveph.io OLD=invoice.dryveph.io MODE=both     bash deploy/change-domain.sh   # step 1: both addresses open the app
#   NEW=mad.dryveph.io OLD=invoice.dryveph.io MODE=redirect bash deploy/change-domain.sh   # optional: the old address sends people to the new one
#   NEW=mad.dryveph.io OLD=invoice.dryveph.io MODE=only     bash deploy/change-domain.sh   # the old address is removed: only the new one is served
set -euo pipefail
: "${NEW:?Set NEW, e.g. NEW=mad.dryveph.io}"; : "${OLD:?Set OLD, e.g. OLD=invoice.dryveph.io}"; : "${MODE:?Set MODE=both or MODE=redirect}"
[ "$MODE" = both ] || [ "$MODE" = redirect ] || [ "$MODE" = only ] || { echo "MODE must be both, redirect or only"; exit 1; }
die() { printf '\nSTOPPED: %s\n' "$*" >&2; exit 1; }
command -v docker >/dev/null || die "Docker is not installed."

CADDY=$(docker ps --format '{{.Names}}' | while read -r n; do docker port "$n" 2>/dev/null | grep -q '^443/tcp' && echo "$n" && break; done || true)
[ -n "$CADDY" ] || die "No running container publishes port 443. Nothing was changed."
docker exec "$CADDY" caddy version >/dev/null 2>&1 || die "'$CADDY' is not Caddy. Nothing was changed."
SRC=$(docker inspect "$CADDY" --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}')
[ -n "$SRC" ] && [ -f "$SRC" ] || die "Could not find the Caddyfile on disk. Nothing was changed."
grep -q '^# BEGIN mad-receipts' "$SRC" && grep -q '^# END mad-receipts' "$SRC" || die "The MAD Receipts block markers are not in the Caddyfile. Nothing was changed."

# the new address must not already belong to another block (outside ours)
OUTSIDE=$(awk '/^# BEGIN mad-receipts/{skip=1} !skip{print} /^# END mad-receipts/{skip=0}' "$SRC")
echo "$OUTSIDE" | grep -Eq "(^|[[:space:],])(https?://)?${NEW//./\\.}([[:space:],{]|$)" && die "$NEW is already used by another block in the Caddyfile. Nothing was changed."

BACKUP="${SRC}.bak-$(date +%Y%m%d-%H%M%S)"
cp -p "$SRC" "$BACKUP"; echo "Backup: $BACKUP"

PROXY=$'\tencode zstd gzip\n\trequest_body {\n\t\tmax_size 12MB\n\t}\n\treverse_proxy mad-receipts:3000'
if [ "$MODE" = both ]; then
  BLOCK=$(printf '%s, %s {\n%s\n}' "$NEW" "$OLD" "$PROXY")
elif [ "$MODE" = only ]; then
  BLOCK=$(printf '%s {\n%s\n}' "$NEW" "$PROXY")
else
  BLOCK=$(printf '%s {\n\tredir https://%s{uri} permanent\n}\n%s {\n%s\n}' "$OLD" "$NEW" "$NEW" "$PROXY")
fi
TMP=$(mktemp); BLOCKFILE=$(mktemp)
printf '# BEGIN mad-receipts (managed by deploy/change-domain.sh; delete these lines to remove)\n%s\n# END mad-receipts\n' "$BLOCK" > "$BLOCKFILE"
awk -v blockfile="$BLOCKFILE" '
  /^# BEGIN mad-receipts/ { while ((getline line < blockfile) > 0) print line; skip=1; next }
  /^# END mad-receipts/   { skip=0; next }
  !skip { print }' "$SRC" > "$TMP"
cat "$TMP" > "$SRC"; rm -f "$TMP" "$BLOCKFILE"

undo() { cp -p "$BACKUP" "$SRC"; docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true; die "$1 The Caddyfile was restored from the backup."; }
docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 || undo "Caddy says the new config is not valid."
docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile || undo "Caddy could not reload."

echo; echo "Done ($MODE). The MAD Receipts block is now:"; awk '/^# BEGIN mad-receipts/{p=1} p{print} /^# END mad-receipts/{p=0}' "$SRC"
echo; echo "To undo: cp -p $BACKUP $SRC && docker exec $CADDY caddy reload --config /etc/caddy/Caddyfile"
