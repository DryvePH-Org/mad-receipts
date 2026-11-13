# MAD Receipts

Staff fill in an **Acknowledgement of Payment** by hand, attach proofs, and send it for approval. Approved receipts sync to Drive, Sheets, Telegram and the inventory sheet. The design prototype is in `Docs/prototype/`.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

## Database

Migrations live in `supabase/migrations/`.

**Apply to the hosted project** (no `supabase login` needed). Copy the *Session pooler* connection string from the Supabase dashboard → **Connect**, then:

```bash
supabase db push --db-url "postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres"
```

**Local development** (needs Docker):

```bash
supabase start      # applies the migrations
npm run db:types    # regenerate src/lib/supabase/database.types.ts after schema changes
```

To run the app against local Supabase, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from `supabase status` in your shell before `npm run dev` (shell variables win over `.env.local`).

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

## Car documents (the Documentation role)

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
- **Sales upload** (`Upload documents`): type the plate, confirm the car and buyer, take photos. Only a plate that has an AR is
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
- **Targets and big numbers:** numbers like 2/60 compare with targets the Admin sets in Settings → Fields and rules → Dashboard targets. The usual target is 60 units to buy and 60 to release
  each month; any month can have its own (for example December at 40), and the history table shows each month against its own target.
- **Search, filters and details** on the pending, released, hold and purchases lists; on a phone each row becomes a card. Click a row for every field, the full row history
  and a link to that row in the sheet. The number cards jump to their list.
- Staff type these sheets by hand, so reading is forgiving: "₱458,000", "Php20,000", "400K", "290+20k", "October 14", "11/03/2026" all work, and a car price typed
  without its K ("460") or with a typo ("1,030M") is read as thousands.
- Only the Approver and Admin see it. `npm run test:live` reads the real sheets and prints counts.

## How a receipt works

Staff fill in the form by hand (Buyer, Vehicle, Deal, Payment, Finish), attach a proof for every payment, check
the live receipt preview and send it for approval. The Approver (never the person who wrote it) approves or
rejects. Only approved receipts count in a deal's balance. Approving queues the Drive, Sheets, Telegram and
inventory updates (see Background sync).

**Money rules** (the database function `submit_receipt` is the authority, `src/lib/deal/math.ts` only mirrors it
for the screen; `tests/deal-math.test.ts` and `tests/db/manual-entry.test.ts` check both against an independent calculator):

- Buyer pays us = (down payment for financing, or the price for cash) − trade-in + processing fee.
- The trade-in is part of the down payment. If it is worth more than the buyer's share, we pay the buyer the
  difference (needs a proof). Financing with a trade-in above the down payment is refused.
- Loan = price − down payment, paid to us by the lender. It is never part of the buyer's balance.
- Processing fee (financing only) is paid by the buyer on top of the down payment, so it is part of the amount due.
  Default 7% of the loan; one button for no fee; "Other" takes any percent or peso amount and shows the other one.
  Earnest money, the down payment and the fee all come off the same balance.
- "In lieu of documents" stands in for part of the payment: it is taken off the balance like a payment, never more than the buyer owes.
- Balance = amount due − earlier payments − paid today + payout. An overpayment cannot be saved.
- Always: price + fee = trade-in + loan + received − payout + balance.

**Roles:** Sales fills in receipts and sees deals; Approver approves and sees approvals and activity;
Admin manages users, Settings (colors, banks, institutions, notes, phrases, required proofs...) and sync, and can
void, cancel and mark loans released. Settings live in one document (`app_settings`) and change the form at once.

**Pages:** Transactions (`/deals`), New receipt, Approvals, Reminders, Activity, Settings, Users, Sync.
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

## Testing

```bash
npm test                                         # unit tests + database tests (the real migrations, run in memory)
ALLOW_HOSTED_TESTS=yes npm run test:hosted       # the real functions, access rules and storage on the hosted project
npm run test:e2e                                 # Playwright (installed Chrome): fill in, approve, roles, settings, voice
npm run test:live                                # the real Groq API (voice), the real inventory sheet and the real car-document folders (read-only)
```

The hosted and browser tests write only marked data (receipts `ZZT-HOSTED…` / `ZZT-E2E…`, users `zzt-…@example.test`)
and remove it before and after. Run them only while the hosted project holds no real data, or against a test project.
For local runs without touching real services, blank `GOOGLE_*`, `TELEGRAM_*` and `INVENTORY_SHEET_ID` in `.env.local`.

## Background sync

After a receipt is confirmed, four jobs (Drive, Sheets, Telegram, inventory) run right away and are
retried by `POST /api/sync/run` (send `Authorization: Bearer $CRON_SECRET`; schedule it every 5 minutes).
A failed job retries after 1 min, 5 min, 15 min, then 1 h, and stops after 5 attempts. The receipt
itself is never affected. The receipts log sheet needs two tabs named **Receipts** and **Deals**;
header rows are written automatically when a tab is empty.

## The grokbot (how the app will touch Google Sheets)

The grokbot is a bot of yours with its own webhook. The app POSTs one JSON job to the webhook (`Authorization: Bearer <GROKBOT_WEBHOOK_SECRET>`); the bot does the work on the sheet and POSTs its answer to `/api/grokbot/callback` with a token that is good for that one job. Jobs and answers are kept in the `grokbot_jobs` table (migration 25). The same pattern as the repairs bot.

Server settings: `GROKBOT_WEBHOOK_URL` and `GROKBOT_WEBHOOK_SECRET` (`BRIDGE_URL` and `BRIDGE_SECRET` also work), `GROKBOT_CALLBACK_SECRET` (any long random string, e.g. `openssl rand -hex 32`; each job's token is derived from it) and `APP_BASE_URL` (`https://invoice.dryveph.io`: where the bot sends its answers, so it only works on the live server, not on a laptop).

Admin → Sync jobs → **Grokbot → Test the connection** sends a `ping` and shows how long the bot took. The text for the bot's saved instructions is `Docs/GROKBOT_MAD_ROUTINE.md`. The bot works in the background, so an answer takes from several seconds to a minute or two: the app saves a copy of the inventory and refreshes it by a job, and sheet updates go through the sync jobs.

### The Docs Bible through the grokbot

On a car's page, **Docs Bible sheet** shows what was last sent and has two buttons. **Preview what would change** asks the bot to read the unit's row in DOCS 2026 and lists the cells that would change (it writes nothing, so it works while Sheets are frozen). **Send to the sheet now** writes them (refused while frozen). After **Approve** the checklist is queued, **Handed off** writes `SUBMITTED TO JEP m/d` and **Mark as done** writes `ORIG DOCS RECEIVED FROM JEP mm/dd/yyyy` into the next empty `UPDATES` cell of the plate's latest monthly tab; every change also adds a row to the sheet's CHANGELOG. Rules (`src/lib/docs/bible.ts`, `Docs/sheets-study.md`): a Yes is never downgraded, what a person typed is not overwritten, a classification that disagrees is only reported, the latest `DATE ARRIVAL` is the unit's row, a company car is filed as Clean with the secretary columns Yes. Settings: `DOCS_BIBLE_SHEET_ID` (the **copy** while testing) and, in Settings → Print, how the receiver is written (`JEP`). Needs migration 26 (`Docs/apply-migration-26.sql`) and the bot's routine **version 1** (`Docs/GROKBOT_MAD_ROUTINE.md`).

## Google Sheets freeze (on by default)

The app **writes to no Google Sheet** unless `SHEETS_WRITES=on` is set on the server. While frozen: the receipts log, the inventory status (REMARKS) and the Replay are all stopped at the single place every write goes through; the sheet jobs wait as pending (no attempt counted, nothing lost) and are sent once the freeze is lifted; reading (the inventory list, the dashboards) is unaffected. The Sync jobs page shows a banner while it is on. To lift it, set `SHEETS_WRITES=on` in `/opt/mad-receipts/.env` and recreate the container.

## The documents workflow: scan, check, approve, hand off

- **Add documents** (Car documents → Add documents): the staff type only the plate and choose photos. The folder is found, or created in Available units and named from the inventory (`21 Toyota Vios (ABC1234)`; just `(ABC1234)` if the plate is not in the inventory). Each photo is filed and read as it arrives; when the batch ends the team gets one Telegram message. Making a folder needs the new `docs.createFolder` action: paste the updated `apps-script/Code.gs` into the Apps Script and deploy a new version (the future gateway implements it too, see `Docs/bridge-contract.md`).
- **Reading:** each photo is read when it is uploaded (and by the background reader for older ones). Set `XAI_API_KEY` to have **Grok (xAI)** read the pictures instead of Groq (`XAI_VISION_MODEL`, default `grok-4`); without it Groq is used. The reader also says how far the photo must be turned, whether a paper is an **original or a photocopy** and any **defects** it can see (torn, cut off, missing signature...). A photocopy of the OR, CR, a deed or a certificate, and any defect, become flags for the staff.
- **Upright photos:** each file shows a picture on its car page, turned to read upright. Only the view is turned; Drive is never changed. Click it to see it larger.
- **Telegram** (`TELEGRAM_DOCS_CHAT_ID`, else the main chat): when the last photo of a car is read ("Scanned: N to check"), when a sold car's papers are complete ("Sold, documents complete"), when the staff approves ("Documents OK, ready to market"), and every 3 days for documents out on handoff.
- **About the car:** the staff fill in spare key, casa maintenance (when, where), battery (when), where it was bought, and for an EV the charger and the card. Blank items are listed when approving; approving anyway is allowed after a confirmation.
- **Approval:** one button. It marks the documents OK and tells marketing on Telegram.
- **Handoff** (sold cars only, after moving the folder to Sold): tick each paper, **Handed off to** the receiver named in Settings → Print (the same name as the transmittal's "Received by"), and the car appears under **Documents on handoff**. The daily job `/api/docs/handoff-reminders` (cron line in `deploy/vps-install.sh`) sends one Telegram message every 3 days until **Mark as done** is pressed.
- **Drive filing of the approved AR is off** (set `SYNC_DRIVE_UPLOAD=1` to turn it back on): Sales uploads the signed AR with the buyer's ID and the deed, and those three make up the sold checklist. The plan, phase by phase, is in `Docs/documents-workflow-plan.md`.
- Needs migration 24 (`Docs/apply-migration-24.sql`). Until it is applied the page works and saving shows a clear message.

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
- **In lieu of documents** (amount and date) shows beside the payment, beside the balance, and on the Finish step. It is part of the math: it is taken off the balance like a payment (migration 23), and it can never be more than the buyer owes.

## Delete data (testing and clean starts)

Settings → **Delete data** (Admin only) has buttons that wipe data, each only after typing its exact words (checked again on the server): **Delete all transactions** (deals, receipts, payments, proof photos,
their sync jobs; deal numbers start again at D1001 once migration 20 is applied), **Delete sync jobs**, **Delete the activity log**, **Delete the car documents list** (the app's list only; Drive is untouched) and **Delete everything above**.
Users, roles and settings are never deleted here, and nothing in Google Sheets or Drive is touched (the inventory sheet's statuses are not changed back). Each reset leaves one activity line saying who did it. Deleted data cannot be restored.

## Users and roles

Roles are `staff` (upload and confirm) and `admin` (everything). Public signups are **disabled**: only admins create accounts.

### Create the first admin (once per project)

1. Supabase dashboard → **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up".
2. **Authentication → Users → Add user → Create new user**: enter email and password, tick **Auto Confirm User**.
3. **SQL Editor**, run (with that email):
   ```sql
   update public.profiles
   set role = 'admin', full_name = 'Your Name'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
4. Log in to the app. The header shows an **Admin** badge.

### Add staff

Log in as admin → tap the **Admin** badge (or open `/admin/users`) → **Add staff user**. Give them the temporary password. Use **Reset password** if they forget it.
Log in as Admin → **Users** → **Add a user** (the form opens in a box). Per person you can also: change the role, **Reset password**, **Disable** the account (it cannot log in; nothing is deleted) and open **Access**.

**Access (module control).** A person's modules are their role's, plus modules the Admin adds for them, minus modules the Admin hides. Hiding always wins. Any module can be added, including the powerful ones
(Approvals, Settings, Users, Sync jobs): saving shows what will change and asks to confirm, and a powerful one needs the word GRANT typed (checked on the server too). The database follows the same list for approving
(`review_receipt`, never your own receipt) and for saving settings (migration 21). A non-Admin with Users can look after ordinary accounts but cannot make, change, reset or disable an Admin; wiping data (Settings → Delete data)
stays with the Admin role. An Admin always keeps Users and Settings, nobody can change their own access, and the only Admin cannot be demoted or disabled. Every change is in the activity log. Every page, action and upload
route checks the person's modules (`requireModule`), not only the menu. Needs migrations 18 and 21; until applied the Users page says so and roles keep working.

## Deploying (Hostinger VPS that already runs other projects)

The app runs in its own Docker container next to the other projects. The Caddy that already owns ports
80/443 gives it HTTPS. Nothing else on the server is touched except **one site block** added to that
Caddyfile (backed up first, checked before it is applied, undone automatically if it fails).

**Before anything:** take a snapshot in hPanel → VPS → Snapshots (it keeps one copy; a new one replaces it).

1. **DNS:** an `A` record `invoice` → the VPS IP (already done for `invoice.dryveph.io`).
2. **Get the code** (SSH as root, or hPanel → VPS → Browser terminal):
   ```bash
   git clone https://github.com/DryvePH-Org/mad-receipts.git /opt/mad-receipts && cd /opt/mad-receipts
   cp .env.example .env && nano .env      # fill in the values; add: CRON_SECRET=<output of: openssl rand -hex 24>
   chmod 600 .env
   ```
3. **Install** (it checks everything first and stops without changes if something looks wrong):
   ```bash
   DOMAIN=invoice.dryveph.io bash deploy/vps-install.sh
   ```
4. **Supabase** → Authentication → URL Configuration: set **Site URL** to `https://invoice.dryveph.io`.
5. **Smoke test:** log in, create a receipt with a proof, approve it, check the Drive file, Sheets row, Telegram message and the
   REMARKS cell. On a phone use **Add to Home Screen** (HTTPS is required).
6. **Updates:** `bash /opt/mad-receipts/deploy/update.sh` (pulls, rebuilds and restarts only this app).
7. **Undo everything:** `bash deploy/rollback.sh <the Caddyfile backup path printed by the installer>`.

Background jobs run from `/etc/cron.d/mad-receipts` (sync every 5 minutes, reminder daily 8:00 AM Manila).
Logs: `docker logs -f mad-receipts`. Status: `docker ps`.

### If the server was renamed to `mad-app` (and PCF moved out again)

For a short time the app ran as `mad-app` in `/opt/mad-app` with petty cash (PCF) merged in. PCF is a separate project again.
To put the server back to the names used here, once: `cd /opt/mad-app && git pull --ff-only && bash deploy/switch-to-mad-receipts.sh`
(the site stays up; it undoes itself if anything fails). To remove the PCF tables from this app's Supabase database, run
`deploy/remove-pcf-from-mad.sql` once in the Supabase SQL Editor, then `supabase migration repair --status reverted 20261106000019 20261106000020 --linked`
(the file explains what it deletes).

### Automatic deploys (GitHub Actions)
Every push to `main` runs **CI** (lint, typecheck, unit tests, production build). Only if it passes, **Deploy** logs in to
the server and runs `deploy/update.sh`, which pulls, rebuilds, waits for the app to be healthy, and **goes back to the
previous version by itself** if it is not. The deploy key can run that one script only (a forced command), and only
one deploy runs at a time. Pull requests run CI but never deploy. One-time setup:

1. On the server, allow the key (replace `<PUBLIC KEY>` with the line from `deploy_key.pub`):
   ```bash
   cd /opt/mad-receipts && git pull
   mkdir -p ~/.ssh && echo 'restrict,command="/opt/mad-receipts/deploy/ci-deploy.sh" <PUBLIC KEY>' >> ~/.ssh/authorized_keys
   ```
2. In GitHub → repo → Settings → Secrets and variables → Actions, add `DEPLOY_SSH_KEY` (the private key file),
   `DEPLOY_KNOWN_HOSTS` (the server's host key line) and `DEPLOY_HOST` (the server IP).
3. Turn on branch protection for `main` (require the CI check) so nothing untested can reach the server.

### Keeping projects apart on this server (also for the next project)
- **One folder, one compose project, one container name per project** (`/opt/<project>`).
- **Publish no ports.** Only the shared Caddy owns 80/443; projects are reached through it by name.
- **Add a site block, never replace the Caddyfile.** Back it up, `caddy validate`, then `caddy reload` (no restart).
- **Cap memory and log size** for every container (`deploy.resources.limits.memory`, `logging.options`).
- **Never** run `docker system prune`, `docker compose down -v`, or change the firewall without a snapshot first.
- The Caddy's network is shared so it can reach each app; apps hold no credentials for each other. A stricter
  setup later is one network per project with Caddy joined to each.

### Retry failed syncs
Admin → **Sync jobs** shows what is waiting or failed, with **Retry now** and **Run due jobs now**.

### Rotate keys
Edit `/opt/mad-receipts/.env`, then `docker compose up -d` in that folder (rebuild with `update.sh` if a
`NEXT_PUBLIC_*` value changed). For the Apps Script secret, change the script property too.

_Deploys are automatic: pushes to `main` that pass CI go live._
