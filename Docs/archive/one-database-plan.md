# One database: the plan (19 Nov 2026)

The owner's goal: the Docs Bible and the MAD Price List become **one source of truth in the app**; the Google Sheet tabs stop being places where data is typed. Simplify, normalize, **lose nothing**. The word "Docs Bible" can then go from the screens: it is just the car's record.

Written from the workbook exported on 18 Nov and the live database. The live workbook has since lost some tabs, so a **fresh export** is needed before the import is changed (see the end).

## 1. What each tab is, and what becomes of it

| Tab (as the owner described it) | What the data shows | Home in the app | Action |
|---|---|---|---|
| **2026 NEW UNITS**: a car is listed once its documents are encoded or the car is with us | The arrivals log: identity, status, arrival, owner, buying source, awarded to, prices. 394 of 396 plates already in the database. | The car's record (`docs_units`): Add a car creates the row; the Table sorted by arrival date is this tab | Already migrated. Stop typing in it. Weekly headings ("JANUARY 04 - 10") become a grouping of the Table by arrival week |
| **INVENTORY 2026**: updated from NEW UNITS | What is for sale: prices, location, repair state, notes. Same cars as NEW UNITS that are not sold. | `car_stock` (prices, location, notes) + the car's record. A car shows in stock when it has arrived and is not sold | Imported (60 cars, nothing lost). Next: a new arrival appears in Car Inventory by itself (priced later), a sold car leaves it by itself |
| **FOR RENEWAL**: updated from the OR dates of the documents, flagged when near due | OR expiry per car, days late, free-text remarks (RECEIVED, OP, "pls print") | OR expiry is a **date on the car's record**; the list is **worked out** (due within N days or late); the remarks are a small log (`or_renewals`) | The app flags it: Car Inventory badge, Reminders, a Telegram message to Documentation. The OR expiry already exists in the Docs Bible as the text column `renewal` (176 cars), so no new field is needed, only a clean date |
| **REMARKS** (the name does not say what it is) | An older register of 72 on-hand cars: status, **OR expiration (all 72)**, MO file, **stencil**, **registry of deeds** (a city: QC, MANILA, MARIKINA...), **documents code** (C, L:ORIG ORCR-KAREN, L:ORIG DOCS-CEBU, EW), spare key, prices, location (empty), two checklist columns (empty, only coloured). Only 9 of its cars are on the current price list. | Everything in it exists in the car's record **except** registry of deeds and the documents code; the plate cell is coloured blue (51) or orange (20) and nobody has said what the colour means | Absorb the two missing fields (and the colour, kept as written), then retire the tab |
| **ORCR WITH MAD**: documents handed to Sir Jep | 62 transfers of OR/CR to buyers: buyer, address, phone, CR date, transaction date, ageing, liaison, sales, balance | The app already has the **handoff** (papers out to Sir Jep, back, reminders) and the Docs Bible holds **100 handoff events** ("SUBMITTED TO JEP 9/23", "JEP RECEIVED DOCS") and a paper status (LTO, FOR TRANSFER) | Proposed: bring the 62 rows in as **transfer records on the car** (buyer details come from the deal when there is one). This changes the earlier decision to leave it in the sheet: needs the owner's yes |
| **REPAIRS REPORT** | Repair jobs | Another project, to be connected later | **Not touched.** (14 rows were imported earlier by mistake; the import now skips repairs. They can be removed on request.) |
| **BY PRICE**, BRAND PRICE SUMMARY, REPRICED, Available units, Sheet16, PRICELIST 2025, June14, 2025 NEW UNITS, INCOMING CARS | Copies, reports and history | Views of the same data | Not touched. Archived in the old workbook |

## 2. The one-source model (where each fact lives once)

| Fact | Lives in | Notes |
|---|---|---|
| Who the car is (year, brand, model, color, mileage, transmission, fuel, body type, category) | the car record | typed once, in Add a car |
| Arrival date | the car record | the price list's own date is kept until the 17 differences are settled |
| Papers (CR, OR, deed, IDs, stencil...) and their photos | the car record + Drive | the checklist is derived from the scan and the staff |
| **OR expiry** | the car record, as a real date (today the text `renewal`, in mixed formats such as `09/01/2027` and `2027-09-01`) | feeds the renewal flag. Normalizing the 176 values is part of the work. 8 of 27 cars checked disagree with the price list, mostly format; one sheet typo (`10//08/2026`) |
| Registry of deeds, papers custody | the car record (new fields) | custody meaning to be confirmed |
| Prices, target, reprice, location, notes | `car_stock` | with price history |
| Reserved / Sold | **worked out from the deals**; typed only for cars sold before the app | today it is typed in 3 places (the REMARKS cell, NEW UNITS status, the two Docs Bible status columns) and they disagree |
| Not for sale, for repair, sell as is, shipped to Cebu | one **stock state** chosen by hand | replaces the sale status and vehicle status columns |
| Buyer, address, phone | the deal | never copied |
| Handoff to Sir Jep, dates, who | the handoff records | one record per round |
| Renewal progress | the small renewal log | days late is worked out |

## 3. What gets normalized
Text dates become dates; money is a number; the year is two digits (as the staff know it); spare key is yes / no with a note; the many spellings of a bank become one list; fuel and transmission use one code each; locations and people names come from a list the Admin keeps; the two statuses become one; `N/A` and blank mean the same where they mean "none".

## 4. How nothing is lost
- Every imported row keeps its **original cells** (`raw`), as the Docs Bible and price list imports already do.
- Each step is a **dry run first**, with a report, and each tab has a **verify script** that compares the app with the workbook cell by cell (the price list one found 1,295 of 1,320 identical; the rest were blanks the app fills).
- Anything two sources disagree on goes to a review list (the Data check) and is never silently chosen.
- The old workbook stays untouched as the archive; nothing is deleted from the database by these steps.

## 5. Order of work
1. **Fresh export** of the live workbook; re-run the study on what is left.
2. **OR expiry**: one clean date per car (normalize `renewal`, merge the price list's, REMARKS' and FOR RENEWAL's dates, review list for disagreements) and the **renewal flag** in the app and on Telegram.
3. **REMARKS**: add registry of deeds and papers custody, import them, retire the tab.
4. **One status**: derive Reserved / Sold from the deals, one stock state for the rest, and the receipt approval writing it (no more REMARKS text).
5. **Car Inventory and the car picker read the database**; the edit screen for Admin and Approver.
6. **ORCR WITH MAD** into transfer records (if the owner agrees).
7. **Cut-over checks** per tab, then lock the moved tabs in the old workbook.
8. Rename "Docs Bible" on the screens.

## 6. What the owner needs to answer or provide
1. A fresh export of the live workbook (the tabs changed).
2. What the DOCS / DOCUMENTS code means: my reading is `C` = the company has the original OR/CR (51 of 62 cars) and `L:...` = lent or with a named person (L:ORIG ORCR-KAREN, L:ORIG DOCS-CEBU). Is that right? What are `K` and `EW`?
3. What the blue and orange plate colours in REMARKS mean.
4. ORCR WITH MAD into the app as transfer records: yes or no?
5. OR renewal flag: how many days before the expiry should it flag (30, 60)? Who is told (Documentation)?
6. The 14 repairs imported earlier: leave or remove?

## 7. Answers and progress (19 Nov 2026, second half)

Owner's answers: the REMARKS tab is not needed as a tab, only the data written in it; the colours need no attention (kept as written); ORCR WITH MAD is the papers handed to Sir Jep, related to the transmittal report (so it is the handoff, not a separate list); the OR flag is at **30 days** and **Documentation gets the Telegram message**; the 14 repairs imported earlier are **left for now**; the order of work in section 5 is agreed.

The fresh export (62 cars, 3 tabs gone: Available units, INCOMING CARS, Sheet16) shows the live sheet is edited every day (in one day: one car left, two Reserved notes typed by hand, a repair note removed, DDZ9807 priced). So the import has to be run again at the cut-over, and **a reservation typed by hand must still be possible** when there is no receipt behind it: the "one status" step keeps a manual Reserved (name and date) next to the one worked out from the deals.

Step 1 (fresh study) is done. **Step 2, the OR expiry, is built:**
- Migration 37 adds `or_expiry` (a real date) and `or_expiry_raw` to the car record and fills them from the typed `renewal` (176 cars; the typed text is kept as it was). A trigger keeps them in step whenever `renewal` is typed.
- `scripts/or-expiry-sync.ts` (dry run first) brings together the Docs Bible, the price list, the FOR RENEWAL tab and the REMARKS register: 48 blank dates are filled where the sheets agree; 11 different dates go to the Data check (the renewal list and REMARKS only count when their date is later than the Docs Bible's, because they show the date before a renewal). The price list is treated as live: any difference counts.
- The flag: a pill on the car page ("OR expires in 12 days" / "OR expired 5 days ago"), "OR due or late" filter and a note on each row of Car documents, and a Telegram message to Documentation every morning at 9:00 on 30, 14, 7 and 0 days before the expiry and then every 7 days while it is late (sold cars left out).

Step 3 next: REMARKS: only the registry of deeds and the documents code are not yet anywhere; they become fields of the car record, then the tab is retired.

## 8. Car Inventory reads the database (19 Nov 2026, evening)
The owner asked for no connection with the price list sheet or its copy. Done: Car Inventory, the car picker of New receipt, the folder names and the receipt approval's Reserved/Sold note all use the database (`car_stock` + the car record); the Google adapter and its tests are removed; the go-live check looks at the database; Add a car puts a new arrival on the price list; Admin and Approver edit a car from Car Inventory. The old workbook is now only an archive and the source of the daily fresh import until the cut-over.

## 9. One MAD database: how, without losing data or its value (19 Nov 2026, night)

The goal in the owner's words: no "MAD Price List" and no "Docs Bible": **one MAD database** with the web app as its only front. The two have been moved into the same database already; what is left is that some facts are still stored twice, and the screens still carry the two old names.

**Why some facts were stored twice.** The About-the-car checklist was built on 13 Nov, the Docs Bible moved in on 17 Nov, the price list on 19 Nov: three separate places that each kept their own "spare key", "mileage", "arrival"... None was wrong; they were never joined.

**The rule for every shared fact: one place, everything else reads it.**
1. *Same fact typed twice* (spare key, arrival date, mileage, fuel, encumbrance, OR date, status): one value is kept in the car's record; the other value is not thrown away, it stays in the car's history and in the saved original row. Everything (Car Inventory, Car documents, the Excel, Telegram) reads the one value. **Spare key: done** (the record is the only source; answering it on the car page writes the record; a stored checklist answer is only a fallback).
2. *Two different facts that look alike* (the registration model "WIGO 1.0G E MT" vs the sales label "WIGO E"; a colour name vs a simpler colour): both are kept, each under its own name, so nothing is lost: model = the registered variant, plus a **sales label**.
3. *Stock facts* (price, target, reprice, location, notes, state) live in the stock row today; once all differences are settled the stock row and the car record become **one table of cars** (a safe merge: a database view first, the same data, then the columns move), and the two old names disappear from the screens: **Cars** (papers, scan, handoff) and **Car Inventory** (price, state, stock) are two views of the same record.

**How it stays safe, at every step:** a dry run first; the verify script compares the app with the workbook cell by cell before and after; each change is recorded in the car's history with who and when (so it can be undone); nothing is deleted, only moved; the old workbooks stay untouched as the archive.

**What is left to settle (77 + 11 rows):** model 28, arrival date 17, color 5, mileage 5, fuel 3, encumbrance 1, status 4, OR expiry 11. Proposed rules (the owner decides): arrival date: ?; model: keep the registered variant and keep the price list's wording as the sales label; color: keep the fuller name, the shorter is kept in the history; mileage: the newer one; fuel: one code (DIESEL); encumbrance: the fuller text; status: the Reserved note stays (a person typed it), the record's status follows; OR expiry: a person chooses per car.

## 10. Step 1 done: one name, one Data check (19 Nov 2026, late)
The screens no longer say "Docs Bible" or "price list": the car's details are the **car record**, the two views are **Car documents** and **Car Inventory**, and a car that exists is simply **in MAD**. The two review lists are one **Data check** (`/data-check`, opened from Car documents and Car Inventory): one tab for the cars where Car Inventory and Car documents differ, one for what the move off the old sheets could not decide. The old addresses redirect. Telegram, the go-live check and the messages use the same words. The "Table" keeps the sheet's columns but is just called Table.

The two old addresses (`/docs-bible/review`, `/cars/sync`) were removed at the owner's request: only `/data-check` exists.

## 11. The REMARKS fields (19 Nov 2026, night)
Step 3 of the order: the two facts only the REMARKS register held are fields of the car record, edited by Documentation in Car documents and the Table: **PAPERS WITH** (where the original papers are: C, L:ORIG ORCR-KAREN...) and **REGISTRY OF DEEDS** (QC, MANILA...). "Papers with" used to sit on the stock row (the price list's DOCS column): it moves to the record (migration 38 copies the codes over), so it is stored once; Car Inventory and the Excel read it from the record, and the stock edit screen no longer has it. `scripts/remarks-sync.ts` (dry run first) fills blank fields from the REMARKS register (55 codes and 38 registries in the dry run) and puts a different code on the Data check, where a person chooses between "the other sheet's" and "the car record's". The CSV in the old layout gets two columns after AP. The REMARKS tab is no longer needed. The stock row's own `papers_with` column is dropped in the cleanup after the cut-over.

## 12. Step 6: one table of cars (migration 40)

The sale list's fields (prices, location, tools, note, section, order, the six "what the sheet showed" overrides, in_stock) are now columns of the car record (`docs_units`). `car_stock` is kept untouched as the safety copy; the code no longer reads or writes it. `scripts/pricelist-apply.ts` was removed (a re-run would overwrite live data). After the cut-over is checked, a later migration drops `car_stock` and the `list_*` overrides once settled.
Order of work: apply migration 40, then push (old code keeps working on `car_stock` in between), then run `scripts/pricelist-verify.ts`.

## 13. Step 7: ORCR WITH MAD as transfer records (migration 41)

`car_transfers`: one row per transfer of the OR/CR to a buyer (buyer, address, contact as typed, what is done, financing, CR date, transaction date, liaison, sales, balance, note, finished on). Linked to the car record by plate; a car not in the record yet is kept by its plate and linked by a trigger when it is added. AGEING is never stored. Seen and edited by Admin, Approver and Documentation only (buyer data), in Car documents → Transfers and on the car page. Import: `scripts/transfers-import.ts` from the tab's snapshot (62 transfers: 28 linked, 34 waiting for their car). The tab stays in the old workbook, not locked; the staff keep the data up to date in the app.

## 14. Repairs (migration 42)

The repairs bot (Telegram, in the repairsVoiceAutomation project) used to have grokbot write a Google sheet. The data now lives in `car_repairs` (one row per problem; approval pending / approved / rejected; key = the bot's id; events in `repair_events`). Everyone sees the Repairs module; only the Approver (and Admin) approves, rejects and updates. An approved open job keeps an Onhand car **For repair**; when the last one closes the car is Onhand again (reserved, sold or not-for-sale cars keep their state). The connection for the bot is `/api/repairs` (secret `REPAIRS_BOT_TOKEN`): `report`, `update`, `decide` and the list of open jobs; the bot's grokbot/sheet steps are to be replaced by these calls (the bot still needs speech-to-text and the parsing of what was said, which grokbot did). `scripts/repairs-import.ts` brought in the repairs tested in the copy of the MAD PRICE LIST (the test car TST 001 and plates MAD does not have were left out).

## 15. The repairs bot inside the app (migration 43, stage 1)

The existing repairs bot (same Telegram bot and group) moves into the app, replacing the Python bot, grokbot and the sheet. Stage 1 (built): `/api/repairs/telegram` webhook (answers at once, works after; update ids make a resend harmless), people list (Repairs page → admin panel, from the bot's /whoami), drafts and "what the bot waits for" saved in the database, the old bot's wording (en/tl/mix) and cards, text report → draft card (Submit / Edit / Read again / Cancel) → pending jobs in the Repairs module → approval in Telegram or on the page (the card follows either way), reject with reason and Fix-and-resubmit, an Approver's own report asks before self-approval. The reading is one model call (`ANTHROPIC_API_KEY`, else Groq) checked against MAD's cars (plate found, make and model, nearest plate as a hint).
Stage 2 (built): voice notes through ElevenLabs (`ELEVENLABS_API_KEY`), the same draft card. Stage 3 (built): `/open [plate]` with a Mark-done button per job, and spoken updates ("update, NAS 3571, tapos na"): the reading is shown the open jobs (J1, J2...) and may only match those. Stage 4 (built): every 5 minutes (the app's scheduled job) overdue jobs are reminded in the group at 8, 12 and 16 (Done / Mute buttons), a report waiting for approval is nudged every 4 hours, and a report stuck while being read gets a Try again button and an Admin alert.
Not yet: the switch (stage 5: `scripts/repairs-webhook.ts` prints the old address, then points the bot here; the Python bot is retired after a clean week).

Update 2026-11-20: the bot was switched to the app and the old Python repairs-bot project was removed from the server (cron files moved out, containers down without -v, folder kept as `/opt/repairs-bot.removed-2026-11-20`). "Go back to the old bot" on the Repairs page no longer has an old bot to go back to.
