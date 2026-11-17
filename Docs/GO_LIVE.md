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

## Switching from the test Drive to the live Drive
The app reads and files photos through the Apps Script, which only works inside the folders named in its script properties. To switch:
1. In the Apps Script editor: paste the updated `apps-script/Code.gs`, then **Deploy → Manage deployments → edit → New version**.
2. **Project settings → Script properties:** set `DOC_ROOT_ID` to the id of the live folder that holds the **Available units** and **Sold units** folders (the id is the last part of the folder's address, after `/folders/`). If those two folders are not inside one folder, set `DOC_AVAILABLE_ID` and `DOC_SOLD_ID` instead. Remove the old `DOC_AVAILABLE_ID` / `DOC_SOLD_ID` of the test Drive if you use `DOC_ROOT_ID`, because they take priority.
3. Run `inspectDocRoot` once in the editor (Run). The Execution log lists the folders it found for Available and Sold and how many car folders each has. Check the numbers look right.
4. Make sure the Google account that owns the script can open the live folders.
5. In this project: `npx jiti scripts/reset-test-documents.ts` shows what it would delete (the test cars' folders, photos, scan results, approvals); `--apply` deletes it. It never touches the Docs Bible register.
6. In the app: **Car documents → Refresh from Drive**. The live car folders appear (cars with a folder in the live Drive); open one and scan.

## After going live
- A copy of the whole Docs Bible is saved every day (Car documents → Saved copies, Admin) and can be downloaded as CSV in the old sheet's layout at any time.
- The old Google Sheet is kept as a read-only archive. Nobody types in it any more.
- `SHEETS_WRITES` still controls the receipts log and the inventory status (frozen by default); it has nothing to do with the Docs Bible any more.

## The cut-over: the old sheet becomes read only
The Docs Bible in the database is the one place to work. The old Google Sheet is kept as an archive that nobody types in.
1. **Check nobody typed in the old sheet since the move.** Admin → Sync jobs → Go-live check → "Cut-over" (needs `DOCS_BIBLE_SHEET_ID` set to the live sheet, shared by link). Or from your terminal (read only):
   `npx jiti scripts/docs-bible-sheet-check.ts <sheet id>`. It compares the typed columns with what was moved and lists any change and any row added. Copy those into the app first (Car documents, Add a car).
2. **Lock the old sheet** in Google, as the owner (the app cannot and never writes to it): open the sheet → **Data → Protect sheets and ranges** → for each tab (DOCS 2026, CHANGELOG, AUG, SEPT, OCT, NOV, 2026 NEW UNITS) choose **Sheet**, **Set permissions**, **Restrict who can edit this range: Only you**. Optionally put a note in cell A1 of DOCS 2026 first: "MOVED TO THE MAD APP: do not type here".
3. **Tell the staff** the date, and that Car documents (List and Table) replaces the sheet. The table has the sheet's columns and order; Download as CSV gives the sheet layout any time.
4. **Run the check again** a few days later: it should still say nothing changed.
