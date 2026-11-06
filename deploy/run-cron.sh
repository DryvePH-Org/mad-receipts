#!/usr/bin/env bash
# Calls one of the app's scheduled endpoints from inside its container: run-cron.sh /api/sync/run
exec docker exec mad-receipts node -e "fetch('http://127.0.0.1:3000'+process.argv[1],{method:'POST',headers:{'x-cron-secret':process.env.CRON_SECRET}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" "$1"
