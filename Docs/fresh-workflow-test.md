# Testing the whole documents workflow on two cars (on the copies), up to the move to Sold

Cars: **DAU6444** (a Clean car, 4 photos) and **DAR4015** (Encumbered, 3 photos). Both are in Available units and have a row in the Docs Bible copy. Test only on the copies; never in the live workbooks.

## Before you start
1. Settings and updates are in place: migrations 24 to 29 applied, the bots have routine version 5 (scanner: `Docs/GROKBOT_SCANNER_ROUTINE.md`; sheet editor: `Docs/GROKBOT_SHEET_ROUTINE.md`), `DOCS_READER=grokbot`, `SHEETS_WRITES=docs`, `DOCS_BIBLE_SHEET_ID` and `CARS_SHEET_ID` set.
2. **Admin → Sync jobs → Go-live check → Run the checks**: nothing red.
3. In the Docs Bible COPY, DOCS 2026, clear for each plate's row: `CLASSIFICATION`, `CR` to `PROMISSORY` and `REMARKS I`. In the pricelist COPY (INVENTORY 2026) clear, for each plate's row: `DOCS`, `OR EXP`, `SPAREKEY`, `ENCUMBRANCE`.
4. Baseline: `node scripts/test-report.mjs DAU6444 DAR4015` (read only).

## IN: the car comes in
1. Open **DAU6444** in Car documents. The stage bar is at "Scanned" (step 2) and **Do this next** says to scan the waiting photos. The **Approve** button is grey and says "photos still to be scanned".
2. Press **Scan 4 photos**, then open **DAR4015** and press **Scan 3 photos** straight away. On Admin → Sync jobs, the **Grokbot queue** shows the scanner working on one and the other waiting (with one scanner place). The car page shows a blue box with its place in line.
3. When a scan ends, the photos fill in. Under each photo open **What the bot saw**: the document type and how sure it was, Original or Photocopy, damage seen, and the numbers and names it read. Compare with the photo itself (click the picture to see it larger). The card **What the scan checks** lists every flag and who raises it.
4. **Review.** A red or amber flag is a question: read it, look at the photo, and fix with **Change what this is** if the bot was wrong. Check **Papers needed**: the sold papers (AR, buyer's ID, deed) are expected to be missing at this point.
5. **About the car**: fill a few answers and press **Save the details**.
6. **Approve: documents are OK**. If flags or blank details remain, it asks you to confirm: press **Go on anyway**. Marketing gets a Telegram message.
7. **Sheets: Docs Bible and pricelist** card: it lists what would be written (Docs Bible cells and the four pricelist cells). Press **Check the sheet now** to compare with the real cells, then (or after approving, it is queued by itself) **Send to the sheet now**. Check the Docs Bible row, the pricelist row and the CHANGELOG. `node scripts/test-report.mjs DAU6444 DAR4015` shows both sides.

## Try the wrong order (nothing should happen, and each says why)
- Before the scan ends: **Approve** is grey ("still to be scanned").
- Before approving: **Send to the sheet** is grey ("Approve the documents first") and **Move to Sold** is grey ("Approve the documents first"). Only an Admin sees **Move anyway** and must confirm.
- **Handoff** says "This step comes after the sale".

## OUT: the car is sold, up to the move to Sold
1. Make an AR for the plate (New receipt, as Sales) and approve it as Approver. The car page links the AR.
2. As Sales, **Upload documents** for the plate: the signed AR, the buyer's ID, the signed deed. The scanner reads them; the sold papers show "Uploaded" in **Sold papers and the Sold folder**, and the stage moves to "In Sold" (step 6).
3. Documentation gets "Sold, documents complete" on Telegram. **Move to Sold** is now active: press it, confirm. The folder moves to Sold units in Drive and the stage moves to **Handoff**.
4. (Next test, after the move) tick the papers, **Handed off to**, and later **Mark as done**.

## Clean up
Clear your test cells again in both copies; the cars stay. Nothing in the live workbooks is ever touched.
