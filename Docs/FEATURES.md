# MAD App: how each part works

The details of every feature, moved out of the README so the README stays short. Contents:

- [Inventory](#inventory)
- [Car documents (the Documentation role, now Buying)](#car-documents-the-documentation-role-now-buying)
- [Vehicle details and layout](#vehicle-details-and-layout)
- [Dashboard (Approver and Admin)](#dashboard-approver-and-admin)
- [How a receipt works](#how-a-receipt-works)
- [Background sync](#background-sync)
- [The grokbot scanner](#the-grokbot-scanner)
- [Google Sheets freeze (on by default)](#google-sheets-freeze-on-by-default)
- [The documents workflow: scan, check, approve, hand off](#the-documents-workflow-scan-check-approve-hand-off)
- [Transmittal receipt (handing papers over with a car)](#transmittal-receipt-handing-papers-over-with-a-car)
- [Choosing a car](#choosing-a-car)
- [The printed receipt](#the-printed-receipt)
- [Moving from the test sheets to the live sheets](#moving-from-the-test-sheets-to-the-live-sheets)
- [Conflicts with the shared sheets (checked before every write)](#conflicts-with-the-shared-sheets-checked-before-every-write)
- [Staying up to date, and the receipt form's feedback](#staying-up-to-date-and-the-receipt-forms-feedback)
- [Delete data (testing and clean starts)](#delete-data-testing-and-clean-starts)

## Inventory

The app reads the existing inventory Google Sheet (tab `INVENTORY 2026`) and changes **only the status
text in the `REMARKS` cell of the car's row**. It never adds, removes, reorders or reformats anything,
and other notes in that cell (`BIG BIG DROP`, `FOR REPAIR - ...`) are kept. The text follows what staff
already write:

| When | REMARKS cell |
|---|---|
| Deal open (earnest / partial) | `RESERVED - DAVID 11/2 10%` |
| Fully paid | `SOLD - DAVID 11/2 100%` |
| Deal cancelled | status removed, other notes stay |
| Car already has a note | `RESERVED - DAVID 11/2 10% \| BIG BIG DROP` |

`DAVID` is the staff member who opened the deal (their **Full name** in the app, in capitals), `11/2` is the
date of the latest receipt (Manila time) and the percentage is the share of the agreed price paid so far.
The format lives in `src/lib/inventory/remarks.ts`.

Settings: `INVENTORY_SHEET_ID`, `INVENTORY_SHEET_TAB=INVENTORY 2026`, `INVENTORY_PLATE_COLUMN=PLATE NUMBER`,
`INVENTORY_STATUS_COLUMN=REMARKS`. Confirming a receipt requires its plate to exist in that tab.

**Test against a copy, not the real sheet:** with `INVENTORY_SHEET_ID` set, confirming a receipt writes to
that sheet. While testing, point it (and the Apps Script's `ALLOWED_SHEET_IDS`) at a copy made with
File → Make a copy. When `INVENTORY_SHEET_ID` is empty, local development uses a stand-in with three
test plates (`NKF4771`, `ABC1234`, `XYZ5678`, see `src/lib/inventory/index.ts`); in production, nothing
can be confirmed until the sheet is configured.

### Connecting Google (inventory, Drive, receipts log)

Pick one way. The app uses whichever is configured (Apps Script wins if both are).

**A. Apps Script bridge** (works with a normal company Google account: no Google Cloud project, no
service account key, no Shared drive needed). The script runs as you, so the sheets and the Drive
folder only need to be ones *you* can edit.

1. Go to script.google.com → **New project**. Delete the sample code and paste all of
   [`apps-script/Code.gs`](apps-script/Code.gs).
2. **Project Settings (gear) → Script properties → Add**:
   - `SECRET`: the value of `APPS_SCRIPT_SECRET` in your `.env.local`
   - `ALLOWED_SHEET_IDS`: the inventory sheet id and the receipts log sheet id, comma separated
   - `ALLOWED_FOLDER_IDS`: the Drive folder id for receipt proofs and records
   - `DOC_AVAILABLE_ID` and `DOC_SOLD_ID`: the ids of the **Available Units** and **Sold Units** folders
     (the car-documents module; the id is the long text at the end of the folder's web address)
3. **Deploy → New deployment → type: Web app**. *Execute as*: **Me**. *Who has access*: **Anyone**.
   Approve the permission screen (Advanced → Go to project) the first time.
4. Copy the **Web app URL** (ends in `/exec`) into `APPS_SCRIPT_URL` in `.env.local`.
5. Check it: opening the URL in a browser should show `MAD Receipts bridge is running`.
   For the car-documents version also paste [`apps-script/appsscript.json`](apps-script/appsscript.json): Project
   Settings → tick **Show "appsscript.json" manifest file in editor**, open it and replace its content. It lists the
   permissions the script needs, including the one for Google's image previews.
6. After you edit `Code.gs`, redeploy: **Deploy → Manage deployments → Edit → New version**. The car-documents
   version asks for one more permission (it fetches Google's preview of HEIC photos and scanned PDFs): approve it
   once (Advanced → Go to project → Allow). The web app URL stays the same.

The script only reaches the sheet and folder ids you list, and refuses any request without the secret.
If *Anyone* isn't offered in step 3, the Workspace admin has restricted it; ask them to allow it.

**B. Service account** (needs Google Cloud access and permission to create keys)

1. In a Google Cloud project, enable the **Google Sheets API** and **Google Drive API**, create a service account and a JSON key.
2. Put `client_email` in `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `private_key` in `GOOGLE_PRIVATE_KEY` (one line, keep the `\n`s).
3. Share the inventory sheet, the receipts log sheet and the Drive folder with that email as **Editor**.
   The Drive folder must be in a Shared drive (service accounts have no storage of their own).

## Car documents (the Documentation role, now Buying)

**Bulk upload and the OUT history (24 Nov 2026).** Every place that takes documents (IN documents, OUT documents, payment papers, Add a car) uses one uploader (`bulk-upload.tsx`): drop or choose any number of photos (60 at a time), a queue sends two at a time with a preview, size and status for each, a bar for the batch, and Try again for a file that failed. "Choose files" names the photo types instead of `image/*`, so a phone opens its gallery and files; the camera is its own "Take a photo" button on touch screens. The OUT documents tab has its own **Activity** list (uploads marked IN or OUT and what they were read as, the sale, payment papers, payment status).

**Car Inventory (was Car status), 24 Nov 2026.** Clicking a car opens its record in a window about half the screen wide (the whole screen on a phone): Who the car is, Status and price, Where it is, Papers, the same sections and names for every car (and on the car's page and the Car documents table: `src/lib/cars/sections.ts`). Every detail has one standard format (`src/lib/cars/standards.ts`): the company's words (the **Brand** is TOYOTA, the **Make** is VIOS 1.3 E, the **Model** is the year model, typed 2019 and kept as two digits), brand, make and color in capitals, body type, transmission (AT, MT, CVT), fuel (GAS, DIESEL, GAS - HYBRID, ELECTRIC, PH EV) and spare key from pick lists, mileage as whole kilometres written 45,000 KM. The Admins edit the details; Sales and the Admins edit status, price and location. There is one value per detail on every screen (the old price list copies were removed on 24 Nov 2026). **Tidy up** (`/cars/tidy`, Admins) lists every value that does not follow its standard with the fix suggested; nothing changes until an Admin applies it. The Car documents table follows the same standards, and Buying no longer edits make, model, color, mileage, transmission, fuel or body type there. Each document also shows who uploaded it and when. **Add a car** is in the side menu for Buying and the Admins (a menu entry that follows the Car documents module, `via` in `navigation.ts`); its form uses the same standards and shows what each value will be saved as; plates are written NKF 4771.

**Documentation role and who edits which tab (27 Nov 2026, migration 74).** A sixth role, **Documentation**, edits every tab of a car and does the transfer of the originals. **Buying** edits only the IN documents; **Sales** and **Online Marketing** edit only the OUT documents (Online Marketing does not see buyers, prices, payments or the sale and transfer tab, as before); everyone else only looks at the tabs they cannot edit. In code: the module `documents` is the IN tab, `upload` the OUT tab and `transfer` the Sale and transfer tab (Documentation and the Admins), with `editsPapers`, `editsOut` and `editsTransfer` in `src/lib/roles.ts`. The handoff reminder every 3 days goes to Documentation. Set the role on the Users page.

**Speed (27 Nov 2026, migration 76).** Every page used to start with three database calls one after the other (ask the sign-in server who you are, then your profile twice). Now the signed session is checked on the app's own server against the project's public keys (`getClaims`), and the profile is one query. Because that does not notice a ban at once, a switched-off account is also marked `profiles.disabled`, which the app reads on every page, so it stops immediately (apply migration 76 before the update). The menu's "cars waiting for a price" number is one count kept for 30 seconds; the Dashboard link goes straight to Buy (no redirect); Car Inventory, Repairs and My Telegram ask for everything at the same time; the live-refresh check runs every 15 seconds instead of 8. Lists of more than 1000 rows (the car files) are read in pages (`selectAll`): the database answers 1000 rows at most per request, so the Car documents list had been missing the files past the 1000th.

**Car documents speed (27 Nov 2026).** The list no longer sends the table view's data (every column of every car): it is read when the **Table** is opened (`loadGridAction`), so the page is about two thirds smaller. The list's reads, and a car page's reads (about 35 queries in nine waves), are now asked at the same time (a car page: 28 queries, three waves; its stage rules are worked out from what is already read, `stageInputOf`). The Receipts tab used to ask Google Drive for the folder's file list every time a car page opened (one to three seconds for Sales and Documentation): now only when the Receipts tab itself is open. A document photo is fetched from Drive once and kept in the server's memory (`preview-cache.ts`, up to 120 MB, least recently used first), and the browser keeps it for a day.

**OUT and Sale and transfer tabs, tidied (27 Nov 2026).** The OUT documents tab is the three papers only: the checklist now has its own line **AR: photo of the physical copy** (required, with the buyer's ID and the deed), the receipt saved in the app is a separate optional line that is not shown on the tab, and the payments card and the "No AR to upload? Add the sale by hand" card are gone. The Sale and transfer tab no longer shows the "sale of this car" card. Upload is the same on all three tabs: the **Upload documents** button at the top right of the card opens the drop box. Each tab has its own **Activity** list (IN and the car as a whole, OUT, transfer); the file-level actions (change what a photo is, correct a reading, remove) are filed under the photo's own stage.

**Home, a dashboard for every role (27 Nov 2026, first version).** Everyone lands on **Home** (`/home`, module `home`, first in the menu; the address `/` leads there). It has two parts. **What I am working on**: the photos the person uploaded in the last three days, grouped by car and by stage (IN documents, OUT documents, papers back from the transfer), with four steps (Uploaded, Scanning, Read, Approved), where the scan is in its bot's line ("Waiting: 3rd in line"), what was read ("Read: 2 of 3 papers in, 1 photo to check"), who approves it next, and the time of the last photo. While anything is still moving the page looks again every five seconds, so a finished scan shows up by itself; approved work moves to **Finished**, kept for three days. **Needs my attention** (tiles, by role): repair reports waiting (Super Admin, Admin, Sales), new cars waiting for a price, the data check, failed background jobs (Super Admin), cars whose IN documents are not approved (Buying, Documentation, Admins), papers with Sir Jep and sold cars not handed off (Documentation, Admins), cars ready to market this week (Online Marketing, Admins). The words and steps are in `src/lib/home/work.ts` (tested); the reading is `work-server.ts` and `attention.ts`.

**Agreed price in Car Inventory (27 Nov 2026, migration 77).** **Change price or state** has an **Agreed price** box for a reserved or sold car. It is text on the car's own record (`docs_units.agreed_price`, up to 60 characters), so it can hold what staff write ("476,000", "600,000 plus the fee"). Car Inventory shows it as "Agreed ₱476,000" (a plain amount gets the peso sign and commas; other words are shown as written); when the car has none, the amount of its sale record (`car_sales.agreed_price`) is shown, and the box starts with it. Not shown to Online Marketing. The migration also moved the price Admins had written in the note of a reserved or sold car into the new box (the first amount of the note; the note itself is kept). The sale record's own field is called **Sale price** on the screens, so the two names differ.

**Three stages, three scanners (27 Nov 2026, migration 75, foundation).** A car's photos belong to a stage (`folder_files.stage`: `in`, `out` or `transfer`) and each stage is read by its own bot, with its own line in the Grokbot queue: the first scanner (`docs_scan`, IN documents), the **OUT scanner** (`docs_scan_out`: the buyer's ID, the deed signed with the buyer and the physical AR) and the **transfer scanner** (`docs_scan_transfer`: OR, CR, PNP clearance and macro-etching, which it places in the checklist by itself). Instructions to paste: `Docs/GROKBOT_SCANNER_ROUTINE.md`, `Docs/GROKBOT_OUT_ROUTINE.md`, `Docs/GROKBOT_TRANSFER_ROUTINE.md`. A bot with its own `GROKBOT_SCAN_OUT_WEBHOOK_URL/SECRET` (or `..._TRANSFER_...`) is called on it; without them the first scanner's address is used. The OUT approval (Sales and the Admins) and the transfer approval (Documentation and the Admins) are kept in `unit_stage_approvals`; the same rule (`stageApprovalRule`) tells what is still open. The physical AR photo now counts for the AR line of the OUT checklist, like a saved receipt. **The shared panel (27 Nov 2026):** the OUT documents tab and the Sale and transfer tab now work like the IN documents: upload (any number of photos), scan by the stage's own bot, a checklist the bot fills in (a photo can be changed to another paper or removed, until the stage is approved), and one approval. OUT: Sales (and the Admins) approve; when the car's IN documents are approved and all three papers are in, the button reads **Approve and move to Sold**. Transfer: Documentation uploads the four papers that come back (OR, CR, PNP clearance, macro-etching), reviews and approves; approving marks the transfer **Back at MAD** (and **Handed off** first when it was never recorded) and the card says the papers are ready for release to the buyer, which is recorded with **Released**. The handoff checklist starts with every paper that is in the folder ticked (it can be changed). The code is `stage-panel.tsx` and `stage-uploaders.tsx` on the car page. Without `DOCS_READER=grokbot` the transfer tab keeps its older per-paper upload card. The three tabs share the same look: one main card (title, how many are in, Approved or Not approved yet, Upload, Scan), the checklist, then the approval below it; clicking a paper opens the same viewer everywhere (the photo, what the bot saw, correcting a type or a reading, removing a wrong photo). Who may correct a photo depends on its stage (IN: Car documents module; OUT: the OUT module; transfer: the transfer module). The IN tab keeps what only it needs: the case choice and the car record comparison.

**IN and OUT documents (24 Nov 2026).** A car's page splits its papers by who adds them. **IN documents**: the papers the car came with. Buying (and the Admins) upload, scan, check and approve them; Sales and Online Marketing only read them. **OUT documents** (Sales, Buying, Admins; not Online Marketing): after the sale, the signed AR, the buyer's ID, the deed and the payment papers. The after-sale checklist lists **every AR that was uploaded** under the signed AR line. The approval card shows the **activity history** of the car (date and time in Manila time, who, what), read from the audit log by plate (migration 52 adds an index). Each tab starts with one line that says what it is and what the signed-in role does there, the main pages (Car documents, Car Inventory, Repairs) open with a note for the role, and the **Next** button follows the role: Buying and the Admins get the IN step, Sales get "Upload the AR" or the OUT documents still to go. The Receipts tab only shows when the car has receipts.

**Payments and the sale, with no digital receipt (migration 51, 24 Nov 2026).** The car's page has a **Payments** tab: one payment status set by hand on the sale record (Unpaid, Partly paid, Fully paid, Loan released), and an archive of payment papers (photo or PDF, with what it is, an optional amount, date and note). The papers are kept in the car's Drive folder next to its other papers; the scanner never reads them, they are not on the checklist, and only an Admin can remove one (to the Drive trash). Sales, Buying and the Admins use it; Online Marketing sees none of it. **Add the sale** on that tab records the buyer, agreed price, date and salesperson when no receipt made the sale: the sold papers (signed AR, buyer's ID, deed) can then be uploaded as before. The Car documents list filters by payment status. **The AR photo does the rest:** on the Payments tab of a car with no sale, **Upload the AR** takes the photo of the signed AR; once it is read, the sale is made from it (the buyer and the date written on it, and the uploader as salesperson when they are in Sales) and the AR counts as the signed AR in the sold papers. The AR also shows in the payments list with the amount and date the bot read. The agreed price is not on an AR, so it stays blank. Add the sale by hand is still there for a sale with no AR. The bot instructions (`Docs/GROKBOT_SCANNER_ROUTINE.md`) gained `amount` and `document_date` for the AR: paste them again. Reminders (which work from deals) are for the Super Admin only until receipts return.

**Papers, cases and details (migration 50, 23 Nov 2026).**
- The scanner tells the two official receipts apart (`or_kind`: the big registration OR, the small last OR; either one counts as the OR) and open from closed deeds (`deed_kind`). It also knows the SPA, Ex-Oficio Sheriff, voluntary documents, Secretary's certificate of JFP and amended articles, the notarized undertaking to change name, and SEC documents: these show on the checklist only when one is in the folder and are never missing. **The text in `Docs/GROKBOT_SCANNER_ROUTINE.md` must be pasted into the Grokbot's saved instructions again** for the bot to use the new fields.
- The required deed is the **open deed of sale** (seller to dealership). A notarized **closed deed** (dealership named, `deed_kind` closed) is kept private: Sales and Online Marketing do not see it on the checklist, cannot open its photo or download it (`/api/docs/file/[id]` answers 404).
- Cases: **Encumbered to Bank** and **Encumbered to Financing** (same papers as before). A car that already has plain **Encumbered** keeps it until Buying picks one; the register still files all three as "Encumbered (Indiv)".
- About the car: which owner (1 = first, 2 = second...), the dealership it was bought from, EV or PH EV, and for those the wall charger, portable charger, key card and charging card.
- Repairs: an approver approves a job as **can be displayed** (the car stays sellable) or **cannot be displayed** (the car is For repair, as before); it can be changed later on the job. Existing jobs are "cannot be displayed".
- Photos: a download button on each photo and **Download photos** for all of a car's photos.
- When a scan finishes, the empty paper boxes of the car's register row say **Yes** for the papers found (typed values are never changed).

A fourth role, **Documentation**, watches each car's papers. Every car has a Drive folder named like
`14 Toyota Vios (AAX-3622)` in **Available units**; when the car is sold the folder moves to **Sold units**.

- **Link by plate:** when an AR is created, the plate is searched in the folder names (dashes, spaces and case ignored).
  One match links it; none or several are flagged for Documentation to fix. "Refresh from Drive" also lists every folder.
- **Reading:** each photo (HEIC and scanned PDFs through Google's own preview) is read by the Groq vision model, which can
  find more than one document in a photo (an OR and a CR are often photographed together). IDs are tied to a person by
  name: the registered owner on the CR, the secretary or representative on the secretary's certificate, or the buyer on the deal.
  Deeds are "seller to dealership" or "signed with the buyer" by who the buyer on them is. Plates, motor and chassis numbers
  and names that disagree between documents are flagged, two photos of one document are marked, and a person can change
  anything. Nothing is deleted or renamed.
- **Checklist by case** (suggested from the papers, changeable): Clean = OR, CR, owner ID, deed. Encumbered = Clean + cancellation of
  chattel mortgage + promissory note. Repo bank = Clean + RCM + promissory note + secretary's certificate + secretary's ID.
  Company = OR, CR, representative's ID, deed, secretary's certificate, secretary's ID, board resolution. For every case, before
  moving to Sold: the AR (the receipt the app already has), the buyer's ID and the deed signed with the buyer.
- **Move to Sold** always asks first and lists whatever is missing; it moves the whole folder.
- **Sold papers** (on the car's page in Car documents; Sales, Approver and Admin, and Documentation): the buyer's ID, the signed deed and the signed AR are added from the car's own page (the "Sold papers" card, which shows the buyer and what is still needed), not from a separate page. Only a plate that has an AR is accepted, so a photo is never filed under a car nobody sold; each photo is filed in the car's folder and read. Sales see the whole car page (photos, what the bot saw, the checklist, the Docs Bible row) and have no other button. `/upload-documents` now leads to Car documents.
  accepted. Each photo is filed in that car's folder and read at once. This is optional: it never blocks printing an AR.
- Needs the updated Apps Script (above), `GROQ_VISION_MODEL`, and migration 17. `DOCS_MOCK=1` and `DOCS_FAKE_READER=1` switch
  to a stand-in Drive and a file-name reader for development and the browser tests.

## Vehicle details and layout

- **Make, type, plate and color** come from the inventory sheet when a unit is picked. The receipt has no motor or chassis number (they were removed); the Car documents module still reads them from the papers to check the documents agree.
- **Colors:** each car shows its brand's own colors first, then the colors cars are most often sold in (Pearl White, Jet Black Mica, Silver Metallic, Graphite Gray, Red Mica...). The Admin edits both lists in Settings.
- **Phones and tablets:** every page is checked at 375, 768 and 1280 px by `e2e/responsive.spec.ts` (nothing may push the page sideways; wide tables scroll inside their box).

## Dashboard (Approver and Admin)

Two dashboards, **Buy** and **Sell / Online marketing**, read live from the team's two Google Sheets every time the page opens (kept for 30 seconds;
"Refresh now" reads again). Nothing is typed in the app. The sheets must stay shared as "anyone with the link can view": the app reads them as plain CSV
(`src/lib/dashboard/sheets.ts`), no key needed. Their ids are in that file as defaults and can be overridden with `DASHBOARD_BUY_SHEET_ID` / `DASHBOARD_SELL_SHEET_ID`.

- **Buy** (buying sheet): purchases today, holds (HOLD tab; rows marked X are settled), payables (balance to the seller plus bank payoff on held units),
  purchases paid from MAD Bank (the sheet has no bank balance), the purchaser scoreboard, sources, and the monthly history next to the team's own BUYING SUMMARY.
- **Sell** (sales sheet, the `MonYYYY_Sold` and `_Entries` tabs, found by name so a new month's tab is picked up by itself): released today, **reserves** (only a reservation paid so far) and **pending sales** (paid in part or in full, not released), each its own list, with plain-English money: selling price, paid at reservation, the lender's loan, what the buyer still owes), a deadline alert (the cleaning date when written,
  otherwise the reservation plus the allowed days), every released sale by month, the salesperson scoreboard, leads by status, and sales history.
  **How a car's state is decided:** the sheet is a ledger. When a reserved car is paid and released, staff add a NEW row and the old RESERVATION row stays behind (the consolidated
  Jan-Sept tab holds later releases too). So the state is the furthest the car got (released or cancelled, then paid, then reserved), rows are matched by plate and buyer, and a reservation
  is dead when the car was later released to a different buyer. Only still-open sales count as pending or overdue.
- **Payments** (Super Admin only, `/dashboard/payments`): banks and ways of payment from the "2026 SALES PASSBOOK MONITORING" sheet, with charts (money in by bank per month, by type, by way of payment, the running net per day, sale payments by stage and bank) and a table view. The sheet is private: it is read through the Google Apps Script bridge (`sheets.tabs`, `sheets.get`; the sheet id must be in the script's `ALLOWED_SHEET_IDS`). MAD keeps a read-only copy (`sheet_bank_lines`, `sheet_sale_payments`, `sheet_sync_tabs`, migration 78) refreshed a few tabs at a time every 5 minutes (`src/lib/payments/sync.ts`), the newest months first; "Copy from the sheet now" forces it. Nothing is ever written to the sheet. The real consolidated sheet is read the same way for Sell once `DASHBOARD_SELL_SHEET_ID` is set.
- **Targets and big numbers:** numbers like 2/60 compare with targets the Admin sets in Settings → Fields and rules → Dashboard targets. The usual target is 60 units to buy and 60 to release
  each month; any month can have its own (for example December at 40), and the history table shows each month against its own target.
- **Search, filters and details** on the pending, released, hold and purchases lists; on a phone each row becomes a card. Click a row for every field, the full row history
  and a link to that row in the sheet. The number cards jump to their list.
- Staff type these sheets by hand, so reading is forgiving: "₱458,000", "Php20,000", "400K", "290+20k", "October 14", "11/03/2026" all work, and a car price typed
  without its K ("460") or with a typo ("1,030M") is read as thousands.
- Only the Approver and Admin see it. `npm run test:live` reads the real sheets and prints counts.

## How a receipt works

Staff fill in the form by hand (Buyer, Vehicle, Deal, Payment, Finish), attach a proof for every payment, check
the live receipt preview and save it. A saved receipt is final and counts in the deal's balance at once (the database
marks it approved by itself, migration 44). Saving queues the Drive audit copy, Telegram and the car's status
(see Background sync). An Admin can delete a whole transaction from its page (receipts, proofs, the audit and AR copies in Drive).

**Money rules** (the database function `submit_receipt` is the authority, `src/lib/deal/math.ts` only mirrors it
for the screen; `tests/deal-math.test.ts` and `tests/db/manual-entry.test.ts` check both against an independent calculator):

- Buyer pays us = (down payment for financing, or the price for cash) − trade-in + processing fee.
- The trade-in is part of the down payment. If it is worth more than the buyer's share, we pay the buyer the
  difference (needs a proof). Financing with a trade-in above the down payment is refused.
- Loan = price − down payment, paid to us by the lender. It is never part of the buyer's balance.
- Processing fee (financing only) is paid by the buyer on top of the down payment, so it is part of the amount due.
  Default 7% of the loan; one button for no fee; "Other" takes any percent or peso amount and shows the other one.
  Earnest money, the down payment and the fee all come off the same balance.
- "In lieu of documents" is the amount the buyer still pays, on or before its date, once the documents are transferred. It stays in the balance (migration 72; before that it was taken off), never more than the buyer owes.
- Balance = amount due − earlier payments − paid today + payout. An overpayment cannot be saved.
- Always: price + fee = trade-in + loan + received − payout + balance.

**Roles** (migration 49; the rules are in `src/lib/roles.ts` and `src/lib/navigation.ts`):
- **Super Admin** (the owner): everything, including the administration tools: Settings (colors, banks, institutions, notes, phrases, required proofs...), Users, Sync jobs, the bot set-up, wiping test data. Settings live in one document (`app_settings`) and change the form at once.
- **Admin**: every module (dashboard, activity log, reminders, Car Inventory, Car documents, Repairs), can edit, delete and add anything in them, but has no administration tools.
- **Buying** (what Documentation was): the car papers, Car Inventory and Repairs to look at.
- **Online Marketing**: Car Inventory, Car documents and Repairs, view only; no prices behind the quoted one, no sale or transfer records.
- **Sales**: change the car papers, the price list in Car Inventory and the repairs.
- **New receipt and Transactions are hidden for now: only the Super Admin sees them.** The dashboard is for the two Admin roles.
- An old Approver is an Admin, an old Documentation is Buying (migration 49 converts them; until it is applied the app reads the old names the same way). The migration makes one account Super Admin, by the email written at the top of the file.
- A person's modules can still be added or hidden one by one on the Users page (Super Admin only).

**Pages:** Transactions (`/deals`), New receipt, Reminders, Activity, Settings, Users, Sync.
`/print/<receipt id>` prints 3 copies by default.

**Voice entry** ("Fill it by voice" on the form): staff speak (English, Tagalog or mixed) or type a note. Groq Whisper
(`whisper-large-v3`) turns it into text, dropping segments it was unsure about; Groq `openai/gpt-oss-120b` reads the
text into fields; then plain code checks every value against the words that were really said and blanks anything that
is not there (`src/lib/voice/grounding.ts`). The form is filled only where it is empty, so what staff typed wins, and
anything blanked or in conflict is listed for them. A plate found in the inventory brings its make, type and color; a
plate that is a different car in the inventory is flagged, not swapped. Needs `GROQ_API_KEY` on the server.
Accuracy safeguards: the model must quote the exact words behind every value and the quote must really be in the
transcript, contain that number and the word naming it (price, down payment...); self-corrections ("sorry, 720") use the
last version and are flagged; a repeated car or payment counts once; numbers that disagree (down payment + loan ≠ price)
are flagged; plate letters said as words ("november kilo foxtrot", "N as in Nancy") are understood; and staff can edit the
heard text and read it again. `npm run test:live` scores 17 messy English/Tagalog/Taglish cases: right, blank (left for
staff, fine) or wrong (never fine). Last run: 53 right, 2 blank, 0 wrong.

Removed from the first version: photo reading and the salespeople/commission pages.

## Background sync

After a receipt is confirmed, four jobs (Drive, Sheets, Telegram, inventory) run right away and are
retried by `POST /api/sync/run` (send `Authorization: Bearer $CRON_SECRET`; schedule it every 5 minutes).
A failed job retries after 1 min, 5 min, 15 min, then 1 h, and stops after 5 attempts. The receipt
itself is never affected. The audit copies go to one Drive folder: set the Apps Script property `RECEIPTS_FOLDER_ID` to its id (each receipt gets its own folder inside a folder for its month).

## The grokbot scanner

The only bot the app talks to now is the **scanner**: it reads the photos of a car's documents. (The sheet-editor bot is retired: nothing writes to the Docs Bible sheet any more, the Docs Bible lives in the database.) The app sends one job with signed links to the photos, does not wait, and the bot answers on `/api/grokbot/callback`; the answer is saved by the app. Settings: `GROKBOT_SCAN_WEBHOOK_URL` / `GROKBOT_SCAN_WEBHOOK_SECRET` (the older `GROKBOT_WEBHOOK_URL` / `GROKBOT_WEBHOOK_SECRET` still work when there is only one bot), `GROKBOT_CALLBACK_SECRET`, `APP_BASE_URL`, and `DOCS_READER=grokbot`. The text for the bot's saved instructions is `Docs/GROKBOT_SCANNER_ROUTINE.md`. Admin → Sync jobs → Grokbot → Test the connection sends a `ping`.

### The car page: one stage at a time

Each car in **Car documents** shows a **stage bar** (When the car comes in: Photos in, Scanned, Reviewed, Approved; When it is sold: Sold papers, In Sold, Handoff, Done) and one **Do this next** box with a link to the right section. The page has two columns: on the left the photos (with **What the bot saw** under each: every document found, how sure the bot was, original or photocopy, damage, and the numbers and names it read), the papers needed, About the car, and a **What the scan checks** card that explains which red flags exist and who raises them; on the right the steps in order: Approval, the Sheets (Docs Bible and pricelist), the sold papers with the **Move to Sold** button, and the Handoff.

The buttons follow the workflow, and the server enforces the same rules (`src/lib/docs/stage.ts`), so pressing out of order does nothing: Scan works only when photos are waiting and no scan is running; **Approve** waits for the scan to finish (open flags and blank details only ask to confirm); **Send to the sheet** needs the approval; **Move to Sold** needs the approval and the three sold papers (the signed AR, the buyer's ID, the deed), and only an Admin can go past that, after a confirmation; **Handoff** works only after the folder is in Sold, and **Mark as done** only while the papers are out. A disabled button always says why underneath.

### Go-live check and the pricelist updates

**Admin → Sync jobs → Go-live check** (also `/admin/golive`) compares everything the workflow depends on with what it expects, read only: the settings (without showing any secret), the database tables and their updates, the pricelist's inventory tab and the columns the bot writes, the Docs Bible's units tab, CHANGELOG tab and monthly tabs (and `#REF!` errors from lost imports), and the Drive folders (folders with no plate in their name, plates with several folders). It is for the day the test copies are replaced by the real files; `Docs/GO_LIVE.md` lists what to change and what the app does when something differs. Tab names that change with the year are settings (`DOCS_BIBLE_DOCS_TAB`, `DOCS_BIBLE_CHANGELOG_TAB`, `PRICELIST_TAB`) and travel with every bot job.

### Car Inventory (the app's own price list)

**New cars to price** (`/new-cars`, module `pricing`, Super Admin and Admin only, with the number of waiting cars beside the menu entry and a note on Car Inventory): a car that is on the sale list, Available, with no price (no Price and no Reprice) is not in Car Inventory yet; it waits here until an Admin types its price (and, optionally, the lowest price). Then it goes into Car Inventory. Cars that are reserved, sold, for repair, sell as is or not for sale are never held back.

**Car Inventory** (`/cars`, for every role) shows the cars of the price list, which lives in the app's own database (no Google sheet is read or written): as cards or a table, with tiles (can be sold, available, reserved, for repair, sell as is, days in stock), a search box, status chips, filters (brand, body type, fuel, price, year, spare key), sorting, and a details window. A car can be sold when it is Available or Sell as is; Reserved and Sold come from the status note, For repair from the repair state. **Admin and Approver change a car** from its details window ("Change price or state"): the state (Available, Reserved, Sold, For repair, Sell as is, with who it is for), the four prices, the location, tools, papers-with and a note; the price history and who changed it are kept. A car can also be taken off the price list (its row and history stay). A new car added with Add a car is on the price list straight away (priced later); an approved receipt writes Reserved or Sold into the status note by itself. The car's make, model, color, spare key and OR date are changed in Car documents, so they are the same everywhere. Admin and Approver can also download the whole list as Excel in the layout of the old price list. The ORCR transfers still live in the old workbook: Car Inventory says so, with a button when `ORCR_SHEET_URL` is set.

### The grokbot queue

Every job for a bot goes through one queue (`grokbot_jobs`): it waits for a free place, is sent, and ends done or failed. A car's page shows a blue box with what the bot is doing for that car. **Admin → Sync jobs → Grokbot queue** shows running and waiting jobs, a Cancel button, "Scan again" for a failed scan, and the last finished jobs. Photos are scanned together (up to 6 per job). A reading that repeats another car's photo word for word is flagged.

### The Docs Bible (in the database)

The Docs Bible is a table in the database (`docs_units`, one row per car arrival; migrations 30 to 32) and is the source of truth. It was moved from the Google Sheet with `scripts/docs-bible-snapshot.py` and `scripts/docs-bible-apply.ts` (the plan and the findings are in `Docs/archive/docs-bible-migration-plan.md`). The page **Car documents** shows the same cars as a **List** (stage, case, papers, warnings) or as a **Table** that looks like the sheet (same columns and order, click a cell to change it, history per car, undo). Documentation edits the paper columns and Admin everything; Sales and Approver only look. **Approve** fills the car's row (classification from the case a person chose, each paper from what is in the folder, a dated scan note); handoffs are kept in `docs_handoff_events`. Things the move could not decide (duplicate plates, differing statuses...) are on **Car documents → Review list**. **Download as CSV** gives the whole table in the old sheet's layout, and one copy a day is saved for 30 days (Admin sees them; needs migration 32).

## Google Sheets freeze (on by default)

The app **writes to no Google Sheet** unless `SHEETS_WRITES` is set on the server: `docs` allows only the Docs Bible edits through the grokbot (the receipts log and the inventory status stay frozen), `on` allows everything. While frozen: the receipts log, the inventory status (REMARKS) and the Replay are all stopped at the single place every write goes through; the sheet jobs wait as pending (no attempt counted, nothing lost) and are sent once the freeze is lifted; reading (the inventory list, the dashboards) is unaffected. The Sync jobs page shows a banner while it is on. To lift it, set `SHEETS_WRITES=on` in `/opt/mad-receipts/.env` and recreate the container.

## The documents workflow: scan, check, approve, hand off

- **Add a car** (Car documents → Add a car; Documentation and Admin): this is where every car starts. The staff type the plate and press Check, then the car's details (make, model, year, color needed; body type, transmission, fuel, mileage, owner, bought from, spare key, arrival date optional; the year is kept as two digits like the sheet), which makes the car's row in the Docs Bible (a plate already there is not added twice unless it arrived again), and then the photos. Photos can still be added later to a car already in the Docs Bible. For the photos: the staff choose photos. The folder is found, or created in Available units and named from the inventory (`21 Toyota Vios (ABC1234)`; just `(ABC1234)` if the plate is not in the inventory). Each photo is filed and read as it arrives; when the batch ends the team gets one Telegram message. Making a folder needs the new `docs.createFolder` action: paste the updated `apps-script/Code.gs` into the Apps Script and deploy a new version.
- **Reading with the grokbot** (`DOCS_READER=grokbot`): photos are not read by a picture API. They are saved as "waiting"; when a batch ends (Add documents) or 25 seconds after the last photo (Sales), or when someone presses **Scan**, ONE job goes to the bot with short-lived signed links (`/api/docs/scan-file/<token>`, valid 90 minutes, one photo each). The bot answers with the same readings (type, orientation, original or photocopy, defects, details) and the card updates by itself. No timer reads photos in this mode. Needs the routine version 2 (`docs_scan`).
- **Reading:** each photo is read when it is uploaded (and by the background reader for older ones). Set `XAI_API_KEY` to have **Grok (xAI)** read the pictures instead of Groq (`XAI_VISION_MODEL`, default `grok-4`); without it Groq is used. The reader also says how far the photo must be turned, whether a paper is an **original or a photocopy** and any **defects** it can see (torn, cut off, missing signature...). A photocopy of the OR, CR, a deed or a certificate, and any defect, become flags for the staff.
- **Upright photos:** each file shows a picture on its car page, turned to read upright. Only the view is turned; Drive is never changed. Click it to see it larger.
- **Telegram** (`TELEGRAM_DOCS_CHAT_ID`, else the main chat): when the last photo of a car is read ("Scanned: N to check"), when a sold car's papers are complete ("Sold, documents complete"), when the staff approves ("Documents OK, ready to market"), and every 3 days for documents out on handoff.
- **Personal Telegram messages** (in addition to the team chats above): each person connects once in **My Telegram** (the paper-plane button by their name, or More on a phone) and gets only the messages for their role: Sales (their receipt approved or rejected, their deals due or late, sold papers missing, deal settled), Approver (a receipt is waiting, receipts waiting too long), Documentation (sold papers added, scan finished, ready for Sold, papers with the receiver, review list, new car), Admin (something broken, void or cancel, user changes, weekly summary). Each person can switch any message off. Nothing is sent 9 PM to 7 AM Manila time (held until 7 AM; the Admin's problem alert is the one exception). Needs migration 34. One-time set-up: the Admin presses **My Telegram → Set up the bot** (it tells Telegram to send what people write to the bot to this app; it refuses if that bot already feeds another program, and then `TELEGRAM_USER_BOT_TOKEN` takes a second bot made in BotFather). The morning and weekly messages are sent by the 5-minute sync job, so no new cron entry is needed. The code is in `src/lib/notify/`.
- **Repair approval chain** (Repairs page, Super Admin, migration 73): the Super Admin lists who is asked first to approve a repair report, and how long each person has (30 minutes to 8 hours, 2 hours by default) before the next one is asked. The person whose turn it is gets a MAD Notification message with **Approve**, **Approve · can display**, **Reject** (the bot then asks for the reason, typed as a reply) and **Open in MAD**. Nobody decided in time: the next person gets the same report ("Still waiting"), then the next, and it goes round again (at most 12 asks per report). People who have not connected Telegram are skipped. Nothing is asked from 9 PM to 7 AM (it starts at 7). When the report is decided anywhere (Telegram, the Repairs page, the repairs group), every open ask is changed to show who decided and the buttons go away. With nobody in the list, everyone who can decide is told, as before. One-time: after the update, press **My Telegram → Set up the bot** again so the bot also receives button presses. The code is `src/lib/repairs/approval-chain.ts`, `approval-telegram.ts` and `chain.ts`.
- **About the car:** the staff fill in spare key, casa maintenance (when, where), battery (when), where it was bought, and for an EV the charger and the card. Blank items are listed when approving; approving anyway is allowed after a confirmation.
- **Approval:** one button. It marks the documents OK and tells marketing on Telegram.
- **Handoff** (sold cars only, after moving the folder to Sold): tick each paper, **Handed off to** the receiver named in Settings → Print (the same name as the transmittal's "Received by"), and the car appears under **Documents on handoff**. The daily job `/api/docs/handoff-reminders` (cron line in `deploy/vps-install.sh`) sends one Telegram message every 3 days until **Mark as done** is pressed.
- **Nothing is filed in Drive automatically any more.** The approved receipt (AR) is no longer put in Drive when it is approved (that setting, `SYNC_DRIVE_UPLOAD`, and `GOOGLE_DRIVE_FOLDER_ID` are gone). The signed AR comes from Sales as a photo on the car's page (Sold papers), with the buyer's ID and the deed, and those three make up the sold checklist. If filing the receipt in Drive is wanted again, it will be a button for the Documentation role on the car's page, not something that happens by itself.
- Needs migration 24 (in `supabase/migrations`).

## Transmittal receipt (handing papers over with a car)

On a car's page in **Car documents**, **Transmittal receipt** opens the "Acknowledgement/Transmittal Receipt" as a form to fill in on screen. It starts from the documents workflow: the make and type from the folder name, the
plate, the owner's name and the OR / CR numbers when they were read, and every paper the folder has already ticked (CR, OR, deeds, IDs, secretary's certificate and ID, release of chattel mortgage, promissory note).
The staff tick the rest by hand (stencils, insurance policy, macro-etching, PNP clearance, manuals, spare key, others), type a note such as the courier, and enter who prepared it and who received it. **Save** keeps it with the
car (migration 22); **Save and print** opens the same half-page print as the receipts, on the chosen paper, two copies by default. It is part of the Car documents module (Admin and Documentation, or anyone the Admin gave that
module to); Sales do not have it by default.

## Choosing a car

The cars come from the inventory sheet. The year model (the **YM** column, two digits such as 26) is shown first: "2026 SUZUKI SPRESSO 1.0 AGS", and goes into the receipt's make / type that way.

## The printed receipt

The default is the booklet's **Acknowledgement of Payment** on **half of an A4 sheet** (210 × 148 mm): business name and the two lines under it, the title and receipt number, then the lined fields, the earnest / partial / full
choice underlined, the vehicle on the left, the money and Cash / Check boxes on the right, the balance and due date, the remarks, the two signature lines and the note. What the system adds (financing, trade-in, in lieu of
documents, other payment methods, earlier payments, several units, remarks and notes) goes in a shaded box so the paper still looks like the booklet. Motor and chassis are not on it, as on the receipt form.
- **Looks computer-printed:** the filled-in values are in a clean sans-serif font (numbers in a monospaced one) on the booklet's serif labels, not a handwriting style.
- **Every detail is on the paper:** a shaded box of labelled cells lists whatever applies (sale type, down payment, loan and lender, processing fee, monthly payment, the trade-in unit, plate, mileage and value, in lieu of documents and its date, earlier payments, payouts, number of units). The preview in the form has a **View larger** button.
- **Paper:** A4, short bond (Letter), long bond (Folio 8.5 × 13) or Legal. The receipt is half of the chosen sheet and the page size is set to match; each computer remembers its choice and the Admin sets the starting one in the editor.
- **Printing:** there is one print view, the half page, always two copies to a sheet with a cut line in the middle. Three copies (the default) are one full sheet and a second sheet with the third copy. No stamp is printed on the paper, approved or not. All the writing is Arial. The page size is set exactly, nothing
  is cut off, and a phone screen shows the sheet shrunk to fit.
- **It never fails to fit:** a half page that has a lot on it shrinks its writing to fit (with a note on the Print page when it has to go small).
- **Print layout editor** (Settings → Print and company, Admin): business name, the lines under it, the title, the logo (resized to a small picture when added), the remarks, the note at the bottom, the two signature labels,
  the color of the receipt number, and what Print starts with (paper, copies). A live preview shows the real paper with a sample receipt.

## Moving from the test sheets to the live sheets

All the Google connections can be pointed at copies first and switched to the live sheets later by changing the Apps Script settings (no code change). Transactions entered meanwhile are replayed with
**Sync jobs → Replay to the live sheets** (Admin only). It shows which sheets are connected (last characters of each id, to tell live from test), then for every car what the live inventory sheet says now and what
would be written. Only clear changes are ticked; a car whose live note differs (staff may have updated it) is flagged and left for you to tick. Log rows and Drive files are queued as ordinary sync jobs (matched by receipt
number and file name, so running it twice adds nothing twice); Telegram is never replayed. REPLAY must be typed. The inventory note is dated with the receipt's own date, not the day it was typed in.
The app only ever edits the one REMARKS cell of a car, keeps any other note, never adds or removes rows, and re-reads the live row at write time.

## Conflicts with the shared sheets (checked before every write)

- **Inventory sheet** (shared with staff): before writing a car's note the app reads what the sheet says now. It writes when the status is empty, or when the note is the same salesperson's own (a reservation becoming a sale,
  a new date, a cancelled deal clearing its note). If the note names someone else, or is not in the usual format, **nothing is written**: the job stops (no retries) and **Sync jobs** shows what the sheet says, why it disagrees and
  what to do, with **Keep the sheet's note** or **Write the app's note instead…** (asks twice). The replay shows the same for every car before anything is sent.
- **Log sheet:** the first row of the Receipts and Deals tabs must be empty or the app's own headers; anything else means the wrong file or tab, and nothing is written (the replay preview says so before sending).
  Receipts are only ever added (matched by receipt number); a deal's row is rewritten with the deal's current figures.
- **Drive:** a file that is already there under the same name is skipped, never replaced.
- Not checked: a deal's log row that someone edited by hand is rewritten with the app's figures; the car-documents folder move.

## Staying up to date, and the receipt form's feedback

- **Live screens:** Transactions, Approvals, Reminders, Activity and the admin pages ask `/api/pulse` (one tiny query: counts and latest times of receipts and deals) every 8 seconds and when the tab is
  revisited. Only when the answer changes does the screen reload its data, with a thin bar at the top and a small "Updating… / Updated" note. The form pages are left alone, and typing is kept.
- **The receipt form is calm at the start:** nothing is red when it opens. Missing fields show in colour only for steps you have been past (or on the last step). The first **Next** on a step with something missing shows
  what and where (and stays); pressing it again moves on. The step bar shows an amber count on steps you left with something open, and the bottom bar says how many are left or "✓ This step is done".
- **In lieu of documents** (amount and date) shows beside the payment, beside the balance, and on the Finish step. It is NOT taken off the balance (migration 72): it is still owed, and it can never be more than the buyer owes. The date drives the reminder.

## Delete data (testing and clean starts)

Settings → **Delete data** (Admin only) has buttons that wipe data, each only after typing its exact words (checked again on the server): **Delete all transactions** (deals, receipts, payments, proof photos,
their sync jobs; deal numbers start again at D1001 once migration 20 is applied), **Delete sync jobs**, **Delete the activity log**, **Delete the car documents list** (the app's list only; Drive is untouched) and **Delete everything above**.
Users, roles and settings are never deleted here, and nothing in Google Sheets or Drive is touched (the inventory sheet's statuses are not changed back). Each reset leaves one activity line saying who did it. Deleted data cannot be restored.


**One car, one record (24 Nov 2026).** The car is one row and the sale (with its transfer) is one row, shown in the same sections with the same names everywhere; the tables are in `Docs/DATABASE.md`. The Car documents **table** has section bands (Who the car is, Registration, Buying and case, Papers, Status and price, Notes) and one name per column; hovering a header shows the old sheet's name, and the CSV export keeps the old sheet's headers. **Paper marks** (CR, OR, deed...) are never empty: what a person chose always stays (Yes, No, To follow, N/A); a box nobody has chosen starts as Yes when that paper is in the folder, otherwise No (N/A when the car's case does not need it). **Add a car** has a **Quick scan**: one photo of the LTO record (MV Inquiry screen, CR or OR) fills the empty boxes; the photo is only read, nothing is saved. The **About the car** answers are columns of the car record. The Car documents list has one search, a **Filters** panel and removable filter chips.


**Documents for the new owner (24 Nov 2026).** After Sir Jep gives the originals back, the staff add a digital copy of each paper that goes to the buyer (OR, CR, PNP clearance, macro-etching) on the car's **Sale and transfer** tab, card "Documents for the new owner". One tap on a paper adds its photos or PDFs at once; or drop every photo together and each one starts as the paper it most likely is (its file name, else the next paper that has nothing yet), to be changed before saving. The copies are kept in the car's Drive folder (named NEWOWNER_...), are not read by the scanner and do not count towards the IN checklist. The Overview shows "Buyer's papers: n of 4" and the card warns when the originals are back but a copy is missing. Everyone who can see the sale can add them; an Admin removes one (it goes to the Drive trash for 30 days).
