#!/usr/bin/env bash
# Deploy the latest code. Run as root in /opt/mad-app. Touches only the mad-app project.
# Safe: one deploy at a time; if the new version does not become healthy it goes back to the previous one.
set -euo pipefail
# Everything runs inside braces so bash has read the whole script before git replaces this file.
{
cd "$(dirname "$0")/.."
exec 9>/tmp/mad-app-deploy.lock
flock -n 9 || { echo "Another deploy is running."; exit 1; }

BEFORE=$(git rev-parse HEAD)
git pull --ff-only
AFTER=$(git rev-parse HEAD)
[ "$BEFORE" != "$AFTER" ] && echo "Updating $BEFORE -> $AFTER" || echo "Already up to date ($AFTER); rebuilding anyway."

docker image tag mad-app/app:latest mad-app/app:previous 2>/dev/null || true
docker compose build
docker compose up -d

healthy() { [ "$(docker inspect -f '{{.State.Health.Status}}' mad-app 2>/dev/null)" = "healthy" ]; }
for _ in $(seq 1 45); do healthy && break; sleep 2; done
if healthy; then
  echo "Deployed $AFTER. mad-app is healthy."
  # Scheduled jobs follow the repository (a new job arrives with the code that serves it).
  sed "s|@DIR@|$PWD|g" deploy/crontab > /etc/cron.d/mad-app && chmod 644 /etc/cron.d/mad-app
else
  echo "The new version is NOT healthy. Going back to the previous one." >&2
  docker logs --tail 30 mad-app >&2 || true
  git reset --hard "$BEFORE"
  docker image tag mad-app/app:previous mad-app/app:latest
  docker compose up -d --no-build
  exit 1
fi
exit 0
}
