#!/usr/bin/env bash
# Calls one of the app's scheduled endpoints with the shared secret: run-cron.sh /api/sync/run
secret="$(grep -m1 '^CRON_SECRET=' /etc/mad-receipts.env | cut -d= -f2- | sed -E 's/[[:space:]]*#.*$//; s/^[[:space:]]+//')"
exec curl -fsS -m 120 -o /dev/null -X POST -H "x-cron-secret: $secret" "http://127.0.0.1:3000$1"
