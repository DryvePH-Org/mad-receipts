# Testing the whole documents workflow with a fresh car (on the copies)

Goal: a car that is new to the app goes through IN and OUT exactly like the picture, without touching a real car or the live workbooks.

## One-time setup (the copies)
1. **Docs Bible copy, tab `DOCS 2026`:** the unit details in columns B to U come from one import formula. Paste them as values so a test row can be added: in the LIVE workbook select columns B:U of DOCS 2026, copy; in the COPY click cell B1 and paste values only (Cmd+Shift+V). Never paste into the live workbook.
2. **Add the test car as a new row** at the bottom of the units in the copy (below the last plate): column A `=L<row>`, column L the plate `ZZT1001`, plus E (year) `24`, F `TOYOTA`, G `VIOS 1.3 XLE` and N `Onhand`. Leave W to AN blank: the app must fill them.
3. **Monthly tab for the OUT step:** in the copy's `NOV` tab (after re-pasting NOV from the live NOV tab, values only), add a row for `ZZT1001` in the plate column (`PLATE #`) with market STATUS `FULLY PAID`.
4. **MAD Pricelist copy, tab `INVENTORY 2026`:** add a row for `ZZT1001` (plate column `PLATE NUMBER`, year, brand, make).
5. **Server settings:** `DOCS_READER=grokbot`, `DOCS_BIBLE_SHEET_ID` (the copy), `SHEETS_WRITES=docs`. Apps Script: the updated `Code.gs` deployed (it makes the car's folder). Bot: routine version 2 saved.

## IN: the new car comes in
1. **Add documents** (Car documents), plate `ZZT1001`: the page says a new folder will be created. Add photos of sample documents (an OR, a CR, an ID, a deed). Test photos only; do not upload a real owner's papers.
2. When the batch ends the page shows "Saved"; the car's page says the bot is scanning. After about 1 to 3 minutes the files show what the bot read (type, orientation, original or photocopy, flags) and Telegram says "Scanned".
3. Review: change a type if it is wrong; fill **About the car** (spare key, casa, battery, where bought).
4. **Docs Bible sheet** card: it already lists what would be written. Press **Check the sheet now**, then **Approve**. The checklist is queued to the sheet; marketing gets the Telegram message.
5. Check the copy: row of `ZZT1001` in DOCS 2026 (classification, CR, OR, deed, seller's ID filled; the dated note in REMARKS I) and one new CHANGELOG row per cell.

## OUT: the unit is sold
1. Make an AR for `ZZT1001` (New receipt) as Sales, approve it as Approver.
2. As Sales, **Upload documents** for the plate: the signed AR, the buyer's ID and the signed deed. The bot scans them; the sold checklist fills.
3. Documentation gets "Sold, documents complete": **Move to Sold**.
4. **Handoff**: tick the papers, **Handed off**: `SUBMITTED TO JEP m/d` appears in the next empty UPDATES cell of the NOV row. Later **Mark as done**: `ORIG DOCS RECEIVED FROM JEP mm/dd/yyyy`. Telegram reminds every 3 days in between.

## Clean up
Delete the `ZZT1001` rows in the copies and the test folder in Drive; the app's rows for `ZZT1001` can be removed from Admin → Settings → Delete data (typed confirmation) or left (they are marked by the ZZT prefix).
