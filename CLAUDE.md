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

## Code map (read this instead of exploring)
- App: Next.js 16 (App Router, server actions), Supabase, Tailwind v4. Pages `src/app/(app)/<module>`, logic `src/lib/<module>`, DB `supabase/migrations/NN_*.sql` (numbered, the owner applies them), PGlite DB tests in `tests/db` run the real migrations.
- Roles: `src/lib/roles.ts` (isAdmin, isSuper, editsPapers = IN documents, editsOut = OUT documents, editsCars, seesSales, seesPrivateDocs) and `src/lib/navigation.ts` (menu and modules). Never compare role strings in pages or actions: use these helpers. Page notes per role: `src/lib/page-notes.ts`.
- Car page `src/app/(app)/documents/[plate]/`: `page.tsx` builds the tabs (Overview, IN documents, OUT documents, Sale and transfer, Receipts, Details); `tabs.ts` (tab names and hints), `files-card.tsx` (IN papers), `paper-viewer.tsx` (full-window viewer), `sold-upload-card.tsx` (OUT checklist and upload), `payments-card.tsx`, `bulk-upload.tsx` (the one uploader), `approval-card.tsx` + `activity-list.tsx` (history).
- Documents logic `src/lib/docs/`: `types.ts` (paper types, cases), `reader.ts` (scanner prompt: change it and re-paste `Docs/GROKBOT_SCANNER_ROUTINE.md` into the bot), `analyze.ts` (types, flags, checklist), `service.ts` (folders, uploads, reading), `workflow.ts` (approve, handoff, details), `archive.ts` + `payments.ts` (payment papers, status), `ar-sale.ts` (sale from the AR), `activity*.ts` (history from the audit log), `details.ts` (About the car).
- Car Inventory `src/app/(app)/cars/` + `src/lib/cars/`: `standards.ts` (one format per detail, used by the table, Add a car and the form), `tidy.ts`, `car-record.tsx`, `edit-stock.tsx`, `model.ts`, `from-db.ts`. Register table: `src/lib/docsbible/`. One value per fact: the car's status is `stock_state` only, its OR expiry the date `or_expiry` only, its details the car record's own columns (no `list_*` copies); plan and progress in `Docs/DATABASE_PLAN.md`.
- Others: sales and transfers `src/lib/{sales,sold,transfers}`, repairs and its Telegram bot `src/lib/repairs`, notifications `src/lib/notify`, receipts `src/lib/deal` + `src/app/(app)/new`, sync jobs `src/lib/sync`.
- Docs: `README.md` (setup, deploy, tests), `Docs/FEATURES.md` (how each part works), `Docs/GO_LIVE.md`, `Docs/archive/` (finished plans).

## Running things (this Mac has 8 GB and another project's tests may run at the same time)
- Check: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`, `npm run lint` (last), `npx vitest run`.
- Browser tests: `NODE_OPTIONS=--max-old-space-size=4096 E2E_PROD=1 ALLOW_HOSTED_TESTS=yes npx playwright test e2e/<file>.spec.ts` (the app runs on port 3124 against the hosted test data). Run one batch at a time and nothing else heavy beside it: a server that dies mid-run (connection refused) is memory, not a bug. Free port 3124 only; never touch another project's processes.
- Delete `.next-e2e` after e2e runs (1.6 GB, rebuilt each run).
