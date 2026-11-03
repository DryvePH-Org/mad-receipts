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

Confirming a receipt requires its plate to exist in the inventory Google Sheet (`INVENTORY_*` env vars).
Until `INVENTORY_SHEET_ID` is set, **local development** uses a stand-in with three test plates
(`NKF4771`, `ABC1234`, `XYZ5678`, see `src/lib/inventory/index.ts`). In production, no plate can be
confirmed until the sheet is configured.

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
