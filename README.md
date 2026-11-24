# MAD App

Staff fill in an **Acknowledgement of Payment** by hand, attach proofs, and save it. A saved receipt is final: nobody approves it. The car's status is set in the database at once, the AR goes to the receipts audit folder in Drive and Telegram is told. Google Sheets are not written. The design prototype is in `Docs/prototype/`.

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

1. **DNS:** an `A` record `mad` → the VPS IP (`mad.dryveph.io`).
2. **Get the code** (SSH as root, or hPanel → VPS → Browser terminal):
   ```bash
   git clone https://github.com/DryvePH-Org/mad-receipts.git /opt/mad-receipts && cd /opt/mad-receipts
   cp .env.example .env && nano .env      # fill in the values; add: CRON_SECRET=<output of: openssl rand -hex 24>
   chmod 600 .env
   ```
3. **Install** (it checks everything first and stops without changes if something looks wrong):
   ```bash
   DOMAIN=mad.dryveph.io bash deploy/vps-install.sh
   ```
4. **Supabase** → Authentication → URL Configuration: set **Site URL** to `https://mad.dryveph.io` (and add it under Redirect URLs).
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

## How each part works

Each feature is described in [Docs/FEATURES.md](Docs/FEATURES.md): [Inventory](Docs/FEATURES.md#inventory), [Car documents (the Documentation role, now Buying)](Docs/FEATURES.md#car-documents-the-documentation-role-now-buying), [Vehicle details and layout](Docs/FEATURES.md#vehicle-details-and-layout), [Dashboard (Approver and Admin)](Docs/FEATURES.md#dashboard-approver-and-admin), [How a receipt works](Docs/FEATURES.md#how-a-receipt-works), [Background sync](Docs/FEATURES.md#background-sync), [The grokbot scanner](Docs/FEATURES.md#the-grokbot-scanner), [Google Sheets freeze (on by default)](Docs/FEATURES.md#google-sheets-freeze-on-by-default), [The documents workflow: scan, check, approve, hand off](Docs/FEATURES.md#the-documents-workflow-scan-check-approve-hand-off), [Transmittal receipt (handing papers over with a car)](Docs/FEATURES.md#transmittal-receipt-handing-papers-over-with-a-car), [Choosing a car](Docs/FEATURES.md#choosing-a-car), [The printed receipt](Docs/FEATURES.md#the-printed-receipt), [Moving from the test sheets to the live sheets](Docs/FEATURES.md#moving-from-the-test-sheets-to-the-live-sheets), [Conflicts with the shared sheets (checked before every write)](Docs/FEATURES.md#conflicts-with-the-shared-sheets-checked-before-every-write), [Staying up to date, and the receipt form's feedback](Docs/FEATURES.md#staying-up-to-date-and-the-receipt-forms-feedback), [Delete data (testing and clean starts)](Docs/FEATURES.md#delete-data-testing-and-clean-starts).

The layout of the code and the rules for working in it are in `CLAUDE.md`.
