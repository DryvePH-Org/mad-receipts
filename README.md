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
- "In lieu of documents" is collateral. No money moves.
- Balance = amount due − earlier payments − paid today + payout. An overpayment cannot be saved.
- Always: price + fee = trade-in + loan + received − payout + balance.

**Roles:** Sales fills in receipts and sees deals; Approver approves and sees approvals, cash report and activity;
Admin manages users, Settings (colors, banks, institutions, notes, phrases, required proofs...) and sync, and can
void, cancel and mark loans released. Settings live in one document (`app_settings`) and change the form at once.

**Pages:** Transactions (`/deals`), New receipt, Approvals, Reminders, Cash report, Activity, Settings, Users, Sync.
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
npm run test:live                                # the real Groq API (voice) and a read-only look at the real inventory sheet
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
