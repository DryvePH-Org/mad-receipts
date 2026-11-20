# Working rules for this project (MAD Receipts)

## Only this project. Never touch another project on the server.

The server (Hostinger KVM 2, `srv2113801`) is **shared**. Other projects run on it (`inventory-flow`, `pcf`, and anything else). They belong to the owner but are **not part of this project**. (The old `repairs-bot` Docker project was removed on 2026-11-20: the repairs bot now lives inside this project. Its leftovers on the server, `/opt/repairs-bot.removed-2026-11-20` and a `repairs-bot` block in the shared Caddyfile, are the owner's to clear: do not touch them.)

**This project is only:** the Docker project `mad-receipts` (folder `/opt/mad-receipts`, container `mad-receipts`), its Supabase database, its Google Apps Script bridge and Drive folders, the repairs Telegram bot that runs inside the app (`/api/repairs/telegram`, token `REPAIRS_TELEGRAM_BOT_TOKEN`), and this repository.

Do not, under any circumstance, unless the owner names that other project and asks for it in the same message:
- read, change, restart, stop, start, update or delete any other Docker project or container, or read its logs, settings or environment (a `get` of a Docker project can show another project's secrets: never do it);
- edit another project's folder, `.env`, cron entries, Caddy/proxy blocks, databases, bots, webhooks or tokens;
- run server-wide commands: `docker system prune`, `docker compose down -v`, `docker volume prune`, `docker network` changes, firewall, DNS, snapshots restore, reboot, package upgrades;
- set a Telegram webhook, or use a token, that another project already uses.

When a task needs something shared (the Caddy proxy, the cron file, a bot, a port), say what it would touch and ask first. Prefer a change that lives entirely inside `mad-receipts`.

Allowed on the server without asking, and only for `mad-receipts`: read its logs, check its status, restart/update **this** project's container.

## The tools
- Hostinger API tools: pass `projectName: "mad-receipts"` every time. `vps_docker_list` shows every project: use it only to confirm this project's name, and do not act on anything else it shows. Do not use `multi-execute`.
- `ssh`, `scp` and server-wide Docker commands are not for this project's sessions.
- This repository's local `.env.local` holds real keys: see the testing rules in the owner's notes (blank real services when testing).

## Other rules
- `AGENTS.md` is written by `next dev`; put project rules here, not there.
- Database changes are new files in `supabase/migrations/`; the owner applies them to the live database.
- Never mention or build anything for PCF (petty cash): it is a separate project.
