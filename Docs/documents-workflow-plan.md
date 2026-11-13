# Car documents: the IN and OUT workflow, phase by phase

Status on 2026-11-13. "Built" means committed in this repository (not yet live unless the push has happened).

## The flow in one page

**IN (a unit comes in).** Staff upload the photos in the web app, they land in the car's folder in *Available units* (folder named with the plate), the scanner reads each new file when it arrives (triggered by the upload, no timer), flags problems, the staff checks and fills in the car's details, approves, the sheets are updated, and marketing is told on Telegram that the unit is ready.

**OUT (a unit is sold).** Sales uploads the DOAS, the buyer's ID and the signed AR through the app, the documents staff are told that the sold documents are complete, move the folder to *Sold units*, review it in the Handoff module and hand it off to Sir Jep. Every 3 days a reminder goes out until Sir Jep returns the documents and the staff press *Mark as done*.

## What changed so the old and new flows do not collide

| Piece | Before | Now |
|---|---|---|
| AR in Drive | The approved AR (an HTML copy and its payment proofs) was filed automatically in the receipts folder | **Off** (`SYNC_DRIVE_UPLOAD` unset). Nothing is filed in Drive by approving an AR. Turn it back on with `SYNC_DRIVE_UPLOAD=1` |
| AR in the checklist | Counted as present as soon as the app had the receipt | **Sales uploads the signed AR** like the ID and the deed. The sold checklist needs three uploads: AR, buyer's ID, deed |
| Reading the AR photo | Filed under "Other" | Recognised as "Acknowledgement of payment (paper copy)" |
| Who tells whom | Nobody was told | Telegram: scan finished, sold documents complete, approved (marketing), handoff reminders |
| Move to Sold | Only a button | Still the button, now followed by the Handoff step |
| Reading | Groq only, free tier of about 35 photos a day | Grok (xAI) when `XAI_API_KEY` is set, otherwise Groq |
| Daily cash report | A module | Removed |
| Google access | Apps Script | Unchanged until the grokbot gateway exists (phase 2) |

## Phases

### Phase 0: clean up (done)
- Daily cash report removed.
- Approved ARs are no longer filed in Drive automatically.
- The signed AR is part of what Sales uploads; the app's own receipt no longer counts as the filed AR.

### Phase 1: the workflow core (built, waiting for the push)
- Reader returns rotation, original or photocopy, and defects; photocopy of OR, CR, deed or certificate and any defect become flags.
- Photos shown upright in the app (Drive untouched).
- "About the car" checklist (spare key, casa, battery, where bought, EV charger and card).
- Approval, with a Telegram message to marketing.
- Handoff to Sir Jep, the "Documents on handoff" list and the 3-day reminder (`/api/docs/handoff-reminders`).
- Database migration 24 (`Docs/apply-migration-24.sql`).
- **You do:** push, apply migration 24, add `XAI_API_KEY`, add the cron line.

### Phase 2: your own bots (next, needs you)
1. **Separate Telegram bot and webhook for the documents flow.** I add `TELEGRAM_DOCS_BOT_TOKEN` and `TELEGRAM_DOCS_CHAT_ID`; the main bot keeps the receipts messages.
2. **The grokbot as the Google gateway, replacing Apps Script.** I write `Docs/bridge-contract.md` (written) and `scripts/bridge-check.mjs` (a read-only checker): every request the app makes (read, update and append a sheet tab; find and upload a file; list folders and files; preview a photo; move a folder), the secret header, and the reply format. You build the bot to match. The app then only needs `BRIDGE_URL` and `BRIDGE_SECRET`.
3. Switch over on the test copies first, run the replay and check, then retire the Apps Script project.
- **Needs from you:** the bot names, how the grokbot is called (URL, secret), and which Google account it uses.

### Phase 3: finish the IN flow
- Staff upload a batch of photos for a plate; the plate folder is created in *Available units* if it is missing (needs the gateway action `folder.create`).
- The scan runs when a file arrives (an upload triggers it); the 5-minute catch-up stays only for files dropped straight into Drive and is cheap when nothing is waiting.
- Your red-flag criteria (original vs xerox, defects, complete and incomplete) replace my defaults.
- On approval, write to the **Docs Bible** (new sheet) and the **MAD Pricelist (INVENTORY 2026)**, with the same conflict checks as the sync today.
- **Needs from you:** the criteria, the Docs Bible link, its tab and columns, and which inventory columns the approval writes.

### Phase 4: finish the OUT flow
- "Upload documents" for Sales becomes the AR, DOAS and buyer's ID screen with a clear "3 of 3" progress.
- The sold-complete notice is already built; it tells the documents staff to move the folder.
- Handoff checklist content: agree the exact list with the staff who handle it.
- Optional: handoff to more than one person, and a page for what is overdue.

### Phase 5: go live
1. Take a backup, switch `INVENTORY_SHEET_ID` to the new sheet, add its ID to the allow-list (or the gateway's).
2. Use *Sync jobs → Replay* to bring approved ARs across with conflict checks.
3. Scan the 95 car folders (about 550 photos). With Grok and credit this is minutes; on Groq's free tier about 10 days.
4. Train the staff: one page for Documentation, one for Sales.
5. Watch the first week's Telegram messages and the Sync jobs page.

## Risks and how they are handled
- **Reader mistakes** (wrong digits, sideways photos): the staff check step stays; every flag is something a person decides.
- **A message that cannot be sent never blocks work**: Telegram failures are logged and shown, the action still stands.
- **No data is deleted** by any phase; new tables only add.
