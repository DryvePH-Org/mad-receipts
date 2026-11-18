# Moving the app from invoice.dryveph.io to mad.dryveph.io

Only this project changes (`mad-receipts`). The server is shared: the only shared thing touched is MAD's own marked block in the Caddyfile, by `deploy/change-domain.sh`, with a backup and an automatic undo.

## Everything that depends on the address

| Where | What it does with the address | What to do |
|---|---|---|
| **DNS** (where `dryveph.io` is managed) | `mad` has to point to the server | Add an `A` record `mad` → `76.13.221.143`, same proxy setting as `invoice` |
| **Caddy** (shared proxy on the server) | Serves the app and gets its HTTPS certificate | `deploy/change-domain.sh` (step 3): both addresses open the app; later the old one redirects |
| **`APP_BASE_URL`** in `/opt/mad-receipts/.env` | The scanner's photo links and the address the scanner answers to | Change to `https://mad.dryveph.io` (step 5) |
| **The scanner bot's routine** | The bot only opens photo links and answers to addresses written in its routine | Paste `Docs/GROKBOT_SCANNER_ROUTINE.md` (version 5.4) into the bot **before** step 5; it accepts both addresses |
| **Supabase** → Authentication → URL Configuration | Site URL and redirect addresses | Site URL `https://mad.dryveph.io`; keep the old one in Redirect URLs for now |
| **Telegram bot** | The webhook points at the address it was set from | Not set yet: press **Set up the bot** on `mad.dryveph.io`, after the move |
| **People** | Logins are kept per address; the installed home-screen icon points at the old address | Everyone logs in again at the new address, and re-adds the home-screen icon |

Not affected: Google Apps Script and Drive, the database address, GitHub deploys (they use the server's IP), the scheduled jobs (they call the app inside the server), the receipts log and inventory sheets.

## Steps, in this order (the old address keeps working until step 8)

1. **DNS.** Add the `mad` A record. Wait until `https://mad.dryveph.io` answers at all (a Caddy or Cloudflare error page is fine at this point). If Cloudflare proxies the address, keep its SSL mode on **Full** (not Flexible).
2. **Push the code.** It only changes defaults and documents; the app behaves the same.
3. **Open the new address on the server** (hPanel → VPS → Browser terminal):
   ```bash
   cd /opt/mad-receipts && git pull --ff-only
   NEW=mad.dryveph.io OLD=invoice.dryveph.io MODE=both bash deploy/change-domain.sh
   ```
   It prints the MAD block it wrote. Open `https://mad.dryveph.io` (a minute for the certificate), log in, open a deal.
4. **Scanner bot.** Replace its routine with the current `Docs/GROKBOT_SCANNER_ROUTINE.md` (version 5.4).
5. **Server settings.**
   ```bash
   cp /opt/mad-receipts/.env /opt/mad-receipts/.env.bak2
   sed -i 's#^APP_BASE_URL=.*#APP_BASE_URL=https://mad.dryveph.io#' /opt/mad-receipts/.env
   cd /opt/mad-receipts && docker compose up -d --force-recreate
   ```
   Then in the app: Admin → Sync jobs → **Go-live check** (App address should show mad.dryveph.io), and scan one car: the photos are read and the answer arrives.
6. **Supabase** URL Configuration (see the table).
7. **Tell the staff:** the new address, log in again, re-add the home-screen icon, replace bookmarks.
8. **After a few days**, make the old address send people to the new one:
   ```bash
   cd /opt/mad-receipts && NEW=mad.dryveph.io OLD=invoice.dryveph.io MODE=redirect bash deploy/change-domain.sh
   ```
   (Then the bot's routine can drop the old address too.)
9. **Telegram:** open `https://mad.dryveph.io/telegram` and press **Set up the bot**.

## Undo
The script prints the exact command that puts the Caddyfile back from its backup. `APP_BASE_URL` goes back from `/opt/mad-receipts/.env.bak2`.
