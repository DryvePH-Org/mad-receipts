# MAD Receipts

Photograph a paper **Acknowledgement of Payment**, let AI read it, review, confirm, and sync it to Drive, Sheets, Telegram and the inventory sheet. Full spec: [`Docs/BUILD_PLAN (1).md`](Docs/BUILD_PLAN%20(1).md).

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
supabase start      # applies migrations + supabase/seed.sql (local test accounts)
npm run db:types    # regenerate src/lib/supabase/database.types.ts after schema changes
npm run test:integration   # sync runner against the local database
docker exec -i supabase_db_AutomatedSalesInvoice psql -U postgres -q < supabase/tests/phase2_constraints.sql
docker exec -i supabase_db_AutomatedSalesInvoice psql -U postgres -q < supabase/tests/phase7_confirm_receipt.sql
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
   - `ALLOWED_FOLDER_IDS`: the Drive folder id for receipt photos
3. **Deploy → New deployment → type: Web app**. *Execute as*: **Me**. *Who has access*: **Anyone**.
   Approve the permission screen (Advanced → Go to project) the first time.
4. Copy the **Web app URL** (ends in `/exec`) into `APPS_SCRIPT_URL` in `.env.local`.
5. Check it: opening the URL in a browser should show `MAD Receipts bridge is running`.
6. After you edit `Code.gs`, redeploy: **Deploy → Manage deployments → Edit → New version**.

The script only reaches the sheet and folder ids you list, and refuses any request without the secret.
If *Anyone* isn't offered in step 3, the Workspace admin has restricted it; ask them to allow it.

**B. Service account** (needs Google Cloud access and permission to create keys)

1. In a Google Cloud project, enable the **Google Sheets API** and **Google Drive API**, create a service account and a JSON key.
2. Put `client_email` in `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `private_key` in `GOOGLE_PRIVATE_KEY` (one line, keep the `\n`s).
3. Share the inventory sheet, the receipts log sheet and the Drive folder with that email as **Editor**.
   The Drive folder must be in a Shared drive (service accounts have no storage of their own).

## Voice note and salespeople

On the review screen staff can record a **voice note** (or type it): the receipt details and who sold
the car, each salesperson with their own commission percent, for example "Salesman David, 3 percent,
Ella, 1 percent". Audio goes to Groq Whisper (`whisper-large-v3-turbo`, override with
`GROQ_TRANSCRIPTION_MODEL`), the same Groq model reads the text into fields, and names are matched to
the salespeople list. The audio is never stored, only the resulting fields.

- **Cross-check:** the voice fills blank fields. Where the photo and the voice both have a value and
  they differ, staff pick one before confirming. Anything typed by staff always wins.
- **Salespeople list:** admins manage it at **Admin → Salespeople**, with nicknames and other spellings
  that help the recording and the name matching. A voice note can only name people on this list.
- **Optional until sold:** a voice note can be said on any receipt. A payment that completes the deal
  needs at least one salesperson with a percent, from that receipt or an earlier one.
- **Sheet text:** `RESERVED - DAVID ELLA 11/2` while open, `SOLD - DAVID 3% ELLA 1.5% 11/2` when sold.

## Testing on the hosted project (before go-live)

While the hosted Supabase holds no real data, database changes can be tested there instead of with Docker.
Everything the tests create is marked (plates `ZZT…`, salespeople `ZZT …`, users `zzt-…@example.test`)
and is removed before and after:

```bash
ALLOW_HOSTED_TESTS=yes npm run test:hosted                  # confirm_receipt outcomes, access rules, admin functions, sync events
node scripts/hosted-test-data.mjs seed /tmp/creds.json      # marked test users and deals, to click through the app
node scripts/hosted-test-data.mjs clean                     # remove all of it
npm run test:e2e                                            # browser tests (below)
```

**Browser tests** (`e2e/`, Playwright with your installed Chrome) start the app on port 3124 and a fake Groq
on port 8766, so no AI, Google or Telegram call is made. They log in as marked test users, upload the sample
photo from `Docs/`, review, confirm, and check that staff are kept out of the admin pages and that a repeated
receipt number is refused. They clean their data before and after.

The seed script refuses to run if the project already has real receipts. **Stop using this once you go live.**
Then test against the local Docker copy (`npm run test:integration`) or a separate test project.

## Testing locally without touching real services

`.env.local` points at your real inventory sheet, Apps Script, Drive and Telegram. For a local test run
with those switched off (so confirming a test receipt can't write to the real sheet or message the
group), start the dev server with them emptied:

```bash
INVENTORY_SHEET_ID= APPS_SCRIPT_URL= APPS_SCRIPT_SECRET= TELEGRAM_BOT_TOKEN= TELEGRAM_CHAT_ID= npm run dev
```

## Background sync

After a receipt is confirmed, four jobs (Drive, Sheets, Telegram, inventory) run right away and are
retried by `POST /api/sync/run` (send `Authorization: Bearer $CRON_SECRET`; schedule it every 5 minutes).
A failed job retries after 1 min, 5 min, 15 min, then 1 h, and stops after 5 attempts. The receipt
itself is never affected. The receipts log sheet needs two tabs named **Receipts** and **Deals**;
header rows are written automatically when a tab is empty.

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

## Deploying (Netlify)

1. Push the repo to GitHub, then in Netlify **Add new site → Import from Git**. `netlify.toml` sets the build.
2. **Site configuration → Environment variables**: add every variable from `.env.example` that has a value
   in `.env.local`, plus `CRON_SECRET` (a long random string). For go-live set `INVENTORY_SHEET_ID` to the
   **real** inventory sheet, and add that sheet's id to the Apps Script `ALLOWED_SHEET_IDS`.
   Never put the service role key, `GROQ_API_KEY`, `APPS_SCRIPT_SECRET` or the Telegram token in the repo.
3. Supabase → **Authentication → URL Configuration**: set **Site URL** to the live address. Keep public
   signups **off**. Run `supabase db push` for any migration not yet applied.
4. Two scheduled functions in `netlify/functions/` call the app with `CRON_SECRET`:
   `sync-cron` every 5 minutes (`/api/sync/run`) and `reminders-cron` daily at 8:00 AM Manila time
   (`/api/reminders/run`). Check **Logs → Functions** after the first run.
5. Smoke test on the live address: log in, upload a photo, confirm, then check the Drive file, the Sheets
   row, the Telegram message and the REMARKS cell of the inventory sheet.
6. Phone: open the site in Chrome or Safari and use **Add to Home Screen**. The microphone only works over
   the live `https` address, so test the voice note there.

### Retry failed syncs
Admin → **Sync jobs** shows what is waiting or failed, with **Retry now** and **Run due jobs now**.

### Rotate keys
Change the value in Netlify (and the Apps Script `SECRET` property if it is the Apps Script secret),
then **Deploys → Trigger deploy**. For Supabase keys, reset them in the dashboard first, then update Netlify.
