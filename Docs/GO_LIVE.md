# Going live: from the test copies to the real sheets and folders

Everything the documents workflow touches is a **copy** today. When the real ones replace them, things may have changed (a renamed column, a new tab for the year, a different folder layout, imports that need access). The app is built so that a difference is **caught and reported, never guessed**: bots find columns by header text and rows by plate, a missing column stops the job, and **Admin → Sync jobs → Go-live check** compares everything with what the workflow expects.

## What to look at, in order
1. **Run the Go-live check** (Admin → Sync jobs → Go-live check) against the copies first: it should be all green. Run it again after every change below. Anything red or amber says what to fix.
2. **The real workbooks** (do this in Google, on the real files, not the app):
   - Docs Bible: the tab of the units (DOCS 2026), its header row (the check lists the headers it needs), the CHANGELOG tab with its 8 headers, the monthly tabs. If imports show `#REF!`, press Allow access (or paste values).
   - MAD Pricelist: the INVENTORY tab, its header row, and the four columns the bot writes: DOCS, OR EXP, SPAREKEY, ENCUMBRANCE.
   - Both must be readable by link for the app's own reading: Car status reads the pricelist and the Go-live check reads both as plain CSV, which needs "Anyone with the link can view". If the real pricelist must not be link-shared, tell me: Car status then needs a different way to read it.
3. **Settings on the server** (`/opt/mad-receipts/.env`, then recreate the container):
   - `DOCS_BIBLE_SHEET_ID`, `CARS_SHEET_ID` (and `PRICELIST_SHEET_ID` if it is not the same), `CARS_SHEET_GID` (the tab's number in its address).
   - Tab names if they differ: `DOCS_BIBLE_DOCS_TAB`, `DOCS_BIBLE_CHANGELOG_TAB`, `PRICELIST_TAB` (for example `DOCS 2027` in a new year).
   - The Drive folders and the old sheet connection: the Apps Script properties `DOC_AVAILABLE_ID`, `DOC_SOLD_ID`, `ALLOWED_SHEET_IDS`, `ALLOWED_FOLDER_IDS`.
4. **The sheet editor bot's instructions:** the two workbook IDs named in `Docs/GROKBOT_MAD_ROUTINE.md` (the "Safety" section, and the live IDs it must refuse). Change them there, run `python3 scripts/split-grokbot-routine.py`, and paste `Docs/GROKBOT_SHEET_ROUTINE.md` into the sheet editor again. The bot refuses any other sheet, so a forgotten ID shows up as "wrong sheet", not as a wrong write.
5. **Test with one car** on the real files with `SHEETS_WRITES=docs`: scan, review, approve, check the Docs Bible row, the pricelist row and the CHANGELOG, then hand off and mark done. `node scripts/test-report.mjs PLATE` shows the app's side and the sheet's side together.
6. **Receipts log and inventory status** (the old connection) stay frozen until you decide: `SHEETS_WRITES=on` lifts the freeze for them too. Do not switch it on until the Go-live check shows the right sheets.

## What can differ, and what the app does
| Difference | What happens |
|---|---|
| A column is renamed or moved | Found by header text, so moving is fine; a renamed one is "missing": the job stops and says which |
| A new tab name (new year) | Set the tab setting; the Go-live check names the tab it looked for |
| Imports lose access (`#REF!`) | The Go-live check warns; the bot cannot find a plate and writes nothing |
| A plate appears twice | The bot refuses an ambiguous plate; the Docs Bible rule takes the latest arrival for units bought back |
| A cell holds something people typed | Only blanks are filled (an OR date is replaced only by a later one); a note says what was left |
| A Drive folder has no plate in its name | Skipped; the check lists them |
| Two bots, one queue | The queue sends one job at a time to the sheet editor |
