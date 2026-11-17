# Going live

The Docs Bible lives in the database now, so going live no longer means pointing the app at real Google Sheets. What is left is the Drive folders, the scanner bot, the settings on the server, and one real car as a last check.

## Before the first real day
1. **Migrations 30, 31 and 32** are applied (Supabase SQL Editor; the files are in `supabase/migrations`). 
2. **The data was moved from the live sheet** with `scripts/docs-bible-snapshot.py` and `scripts/docs-bible-apply.ts` (see `Docs/docs-bible-migration-plan.md`). If anyone typed in the live sheet since, take a fresh snapshot and run the apply script again with `--replace` (it deletes the earlier imported rows and loads again; changes made in the app to those rows would be lost, so do this only before staff start working in the app).
3. **The review list is cleared** (Car documents → Review list): duplicate plates, differing statuses, rows with no plate, cars with no classification.
4. **Settings on the server** (`/opt/mad-receipts/.env`, then recreate the container): `DOCS_READER=grokbot`, `GROKBOT_SCAN_WEBHOOK_URL`, `GROKBOT_SCAN_WEBHOOK_SECRET`, `GROKBOT_CALLBACK_SECRET`, `APP_BASE_URL`, `CRON_SECRET`, the Telegram settings, and for Car status `CARS_SHEET_ID` (the MAD Pricelist, shared "Anyone with the link can view").
5. **Drive:** the Apps Script properties `DOC_AVAILABLE_ID` and `DOC_SOLD_ID` point at the real Available and Sold folders (the photos are read from and filed in Drive).
6. **The scanner bot** has the text of `Docs/GROKBOT_SCANNER_ROUTINE.md` saved as its instructions.
7. **Cloudflare:** if the bot's answer is refused with a 403, add a skip rule for the paths `/api/grokbot/callback` and `/api/docs/scan-file/`.
8. **Run the test flow** in `Docs/TEST_FLOW.md` with one real car.

## After going live
- A copy of the whole Docs Bible is saved every day (Car documents → Saved copies, Admin) and can be downloaded as CSV in the old sheet's layout at any time.
- The old Google Sheet is kept as a read-only archive. Nobody types in it any more.
- `SHEETS_WRITES` still controls the receipts log and the inventory status (frozen by default); it has nothing to do with the Docs Bible any more.
