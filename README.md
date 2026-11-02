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
docker exec -i supabase_db_AutomatedSalesInvoice psql -U postgres -q < supabase/tests/phase2_constraints.sql
docker exec -i supabase_db_AutomatedSalesInvoice psql -U postgres -q < supabase/tests/phase7_confirm_receipt.sql
```

To run the app against local Supabase, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from `supabase status` in your shell before `npm run dev` (shell variables win over `.env.local`).

## Inventory

Confirming a receipt requires its plate to exist in the inventory Google Sheet (`INVENTORY_*` env vars).
Until `INVENTORY_SHEET_ID` is set, **local development** uses a stand-in with three test plates
(`NKF4771`, `ABC1234`, `XYZ5678`, see `src/lib/inventory/index.ts`). In production, no plate can be
confirmed until the sheet is configured.

### Google service account (inventory, Drive, Sheets)

1. In a Google Cloud project, enable the **Google Sheets API** and **Google Drive API**, create a service account and a JSON key.
2. Put `client_email` in `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `private_key` in `GOOGLE_PRIVATE_KEY` (one line, keep the `\n`s).
3. Share the inventory sheet, the receipts log sheet and the Drive folder with that email as **Editor**.

If your Google Workspace blocks creating projects or keys: ask the Workspace admin, or create the project from a
personal Google account and share the Workspace files with the service account (needs external sharing allowed).

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
