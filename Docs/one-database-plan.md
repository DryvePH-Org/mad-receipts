# One database: the plan (19 Nov 2026)

The owner's goal: the Docs Bible and the MAD Price List become **one source of truth in the app**; the Google Sheet tabs stop being places where data is typed. Simplify, normalize, **lose nothing**. The word "Docs Bible" can then go from the screens: it is just the car's record.

Written from the workbook exported on 18 Nov and the live database. The live workbook has since lost some tabs, so a **fresh export** is needed before the import is changed (see the end).

## 1. What each tab is, and what becomes of it

| Tab (as the owner described it) | What the data shows | Home in the app | Action |
|---|---|---|---|
| **2026 NEW UNITS**: a car is listed once its documents are encoded or the car is with us | The arrivals log: identity, status, arrival, owner, buying source, awarded to, prices. 394 of 396 plates already in the database. | The car's record (`docs_units`): Add a car creates the row; the Table sorted by arrival date is this tab | Already migrated. Stop typing in it. Weekly headings ("JANUARY 04 - 10") become a grouping of the Table by arrival week |
| **INVENTORY 2026**: updated from NEW UNITS | What is for sale: prices, location, repair state, notes. Same cars as NEW UNITS that are not sold. | `car_stock` (prices, location, notes) + the car's record. A car shows in stock when it has arrived and is not sold | Imported (60 cars, nothing lost). Next: a new arrival appears in Car status by itself (priced later), a sold car leaves it by itself |
| **FOR RENEWAL**: updated from the OR dates of the documents, flagged when near due | OR expiry per car, days late, free-text remarks (RECEIVED, OP, "pls print") | OR expiry is a **date on the car's record**; the list is **worked out** (due within N days or late); the remarks are a small log (`or_renewals`) | The app flags it: Car status badge, Reminders, a Telegram message to Documentation. The OR expiry already exists in the Docs Bible as the text column `renewal` (176 cars), so no new field is needed, only a clean date |
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
- Anything two sources disagree on goes to a review list (the Price list check) and is never silently chosen.
- The old workbook stays untouched as the archive; nothing is deleted from the database by these steps.

## 5. Order of work
1. **Fresh export** of the live workbook; re-run the study on what is left.
2. **OR expiry**: one clean date per car (normalize `renewal`, merge the price list's, REMARKS' and FOR RENEWAL's dates, review list for disagreements) and the **renewal flag** in the app and on Telegram.
3. **REMARKS**: add registry of deeds and papers custody, import them, retire the tab.
4. **One status**: derive Reserved / Sold from the deals, one stock state for the rest, and the receipt approval writing it (no more REMARKS text).
5. **Car status and the car picker read the database**; the edit screen for Admin and Approver.
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
- `scripts/or-expiry-sync.ts` (dry run first) brings together the Docs Bible, the price list, the FOR RENEWAL tab and the REMARKS register: 48 blank dates are filled where the sheets agree; 11 different dates go to the Price list check (the renewal list and REMARKS only count when their date is later than the Docs Bible's, because they show the date before a renewal). The price list is treated as live: any difference counts.
- The flag: a pill on the car page ("OR expires in 12 days" / "OR expired 5 days ago"), "OR due or late" filter and a note on each row of Car documents, and a Telegram message to Documentation every morning at 9:00 on 30, 14, 7 and 0 days before the expiry and then every 7 days while it is late (sold cars left out).

Step 3 next: REMARKS: only the registry of deeds and the documents code are not yet anywhere; they become fields of the car record, then the tab is retired.

## 8. Car status reads the database (19 Nov 2026, evening)
The owner asked for no connection with the price list sheet or its copy. Done: Car status, the car picker of New receipt, the folder names and the receipt approval's Reserved/Sold note all use the database (`car_stock` + the car record); the Google adapter and its tests are removed; the go-live check looks at the database; Add a car puts a new arrival on the price list; Admin and Approver edit a car from Car status. The old workbook is now only an archive and the source of the daily fresh import until the cut-over.
