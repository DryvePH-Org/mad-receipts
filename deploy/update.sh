#!/usr/bin/env bash
# Deploy the latest code. Run as root in /opt/mad-receipts. Touches only the mad-receipts project.
# Safe: one deploy at a time; if the new version does not become healthy it goes back to the previous one.
set -euo pipefail
# Everything runs inside braces so bash has read the whole script before git replaces this file.
{
cd "$(dirname "$0")/.."
exec 9>/tmp/mad-receipts-deploy.lock
flock -n 9 || { echo "Another deploy is running."; exit 1; }

BEFORE=$(git rev-parse HEAD)
git pull --ff-only
AFTER=$(git rev-parse HEAD)
[ "$BEFORE" != "$AFTER" ] && echo "Updating $BEFORE -> $AFTER" || echo "Already up to date ($AFTER); rebuilding anyway."

docker image tag mad-receipts/app:latest mad-receipts/app:previous 2>/dev/null || true
docker compose build
docker compose up -d

healthy() { [ "$(docker inspect -f '{{.State.Health.Status}}' mad-receipts 2>/dev/null)" = "healthy" ]; }
for _ in $(seq 1 45); do healthy && break; sleep 2; done
if healthy; then
  echo "Deployed $AFTER. mad-receipts is healthy."
else
  echo "The new version is NOT healthy. Going back to the previous one." >&2
  docker logs --tail 30 mad-receipts >&2 || true
  git reset --hard "$BEFORE"
  docker image tag mad-receipts/app:previous mad-receipts/app:latest
  docker compose up -d --no-build
  exit 1
fi
exit 0
}
