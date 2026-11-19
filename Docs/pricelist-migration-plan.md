# MAD Price List: study and migration plan

Studied on 18 Nov 2026 from the workbook the owner exported (`MAD PRICE LIST.xlsx`, kept only in `Docs/sheets-private/`, which is never committed). Numbers below come from reading every tab and comparing it with the Docs Bible in the database.

## 1. The workbook: 15 tabs, but one live list

| Tab | Rows with a car | What it really is | Verdict |
|---|---|---|---|
| **INVENTORY 2026** | 63 | The live price list of what is for sale: price, target, reprice, re-target, location, repair status, status note, encumbrance, OR expiry, spare key, docs custody code, days in stock (formula `=today()-arrival`). Cars grouped under body-type heading rows. | **Migrate** (the price and stock fields only) |
| **2026 NEW UNITS** | 396 | The 2026 arrivals log. Already the source of the Docs Bible. | **Already migrated** (394 of 396 plates are in the Docs Bible). Stop typing here; archive |
| **2025 NEW UNITS** (hidden) | 566 | The 2024/2025 arrivals log, same columns. Only 200 are in the Docs Bible. | **Archive**; import only if you want history in the app |
| **REMARKS** | 72 | A second register of the same cars (status, OR expiration, stencil, registry of deeds, documents, two checklist columns that are empty). | **Drop**: the Docs Bible and the car page do all of it |
| **Available units** | 99 | A snapshot of the price list from 21 Sep 2026, with a `#REF!` formula. | **Drop** (stale copy) |
| **REPRICED** (hidden) | 71 | A copy of the inventory layout with `#REF!` errors in its totals. | **Drop** |
| **BY PRICE** | 58 | The inventory sorted by price, typed, as of 1 Oct. 12 of the 26 cars checked now show a different price from the live list. | **Drop**: Car status sorts by price |
| **BRAND PRICE SUMMARY** | 18 | Units, lowest and highest price per brand, typed. | **Drop**: becomes a view in the app |
| **Sheet16** | 29 | A daily inventory movement table (beginning, purchases, sales returns...) for 1-14 Sep 2025. | **Drop** (stale); the movement can be computed |
| **PRICELIST 2025**, **June14 PRICELIST 2025** (hidden) | 46 / 65 | Old price lists; many "plates" are really plate+CS number run together. | **Archive** |
| **FOR RENEWAL (2026)** | 25 | OR renewal tracking: OR expiry, days late (formula), location, six free-text remark columns (RECEIVED, OP, "pls print"). 17 of its 25 cars are no longer in the inventory. | **Migrate as a small renewal log** |
| **ORCR WITH MAD** | 62 | Transfer of OR/CR to buyers: buyer, address, CR date, transaction date, ageing, liaison (empty), sales, balance (2 filled). All "ORCR TRANSFER" except one duplicate plate. Contains buyers' names and addresses. | **Decide with the owner** (see section 5) |
| **REPAIRS REPORT** | 14 | Repair jobs per car: problem, when, solution, supplier, company, timeline, status, bot id, approved by. | **Migrate** (repairs log) |
| **INCOMING CARS** | 6 | Cars on the way: the arrivals columns plus original price, chassis and engine numbers, owner and buyer details. None are in the Docs Bible yet. | **Replace** by Add a car (add chassis/engine fields if wanted) |

So: 1 tab becomes data (INVENTORY 2026), 2 small logs (repairs, renewals), 1 to decide, 2 to archive, 9 to drop or already replaced.

## 2. What is duplicated, and what disagrees

- The **same car is typed in up to six places**: INVENTORY 2026, 2026 NEW UNITS, REMARKS, Available units, BY PRICE, REPRICED, plus FOR RENEWAL and the repairs list. Year, brand, make, color, mileage, transmission and fuel are copies of one another.
- Against the Docs Bible, the identity fields agree almost perfectly: year 0 differences in 399 cars; make, transmission and fuel agree; **color differs on 4** (`BLACK` vs `GALAXY BLACK`, `WHITE` vs `WHTIE`); the model text differs on 4; spare key and registered owner on 3-4.
- **Status is where they disagree.** The price list says Reserved / Sold in the REMARKS cell; the Docs Bible has its own sale status and vehicle status. Examples: 4 cars the price list calls Reserved are `AVAILABLE` in the Docs Bible; 3 cars 2026 NEW UNITS calls Sold are `ONHAND` in the Docs Bible. The app already writes Reserved/Sold into the REMARKS cell when a receipt is approved, so the sheet and the register can each be right and still differ.
- **Prices disagree between tabs**: 12 of 26 cars checked differ between BY PRICE and the live list (for example 399,000 vs 438,000); 8 of 26 between Available units and the live list. The live list and the 2026 NEW UNITS starting price agree on 56 of 56.
- Plates: 3 rows of the live list are not real cars (`TST 001` and `ABC 1234` are test rows; `NU355A` is an odd plate), and `DDZ9807` arrived on 17 Nov and is not in the Docs Bible yet. Plates run together with other codes in the 2025 tabs.
- Typing problems in the live list: one price stored as text (`₱1,099,000`), two OR expiry dates typed as text (`06/012027`, `10//08/2026`), a DOCS column with codes of unclear meaning (`C`, `K`, `EW`, `L:SERJEL`, `L:ORCR JUSTINE`), encumbrance written 11 ways (`JACCS FINANCE - RELEASED`, `JACCS FINANCE PH`, ...), the same bank under different spellings, `=today()` formulas that recalculate on every open.
- Broken formulas: `#REF!` in REPRICED and in Available units; `vlookup` into a tab that no longer exists.

## 3. Proposed simplified model

**One row per car arrival, in the database, shared by everyone.** The Docs Bible row (`docs_units`) stays the car's identity and papers. Add only what is new:

| New | Holds | Replaces |
|---|---|---|
| `car_stock` (one row per unit in stock: `unit_id`, `list_price`, `target_price`, `reprice`, `retarget`, `location`, `repair_state` (none / for repair / sell as is / not for sale), `docs_custody` note, `note`) | The price list's own columns | INVENTORY 2026 and the 6 copies |
| `car_price_history` (unit, old, new, who, when) | Every price change, so BY PRICE and the repriced list are views, never typed copies | BY PRICE, REPRICED, Available units, PRICELIST 2025 |
| `car_repairs` (unit, problem, when, solution, supplier, company, timeline, status, approved by) | The repairs list | REPAIRS REPORT |
| `or_renewals` (unit, OR expiry, status, notes, who) | The renewal list; days late is computed, never typed | FOR RENEWAL |

Rules that remove the mismatches:
- **Identity is typed once** (Add a car / Docs Bible). The price list shows it, never stores a copy.
- **Reserved and Sold come from deals and receipts** (already in the app). Only For repair, Sell as is and Not for sale are set by hand, in one place. So the status cell stops being text typed in two sheets.
- **Days in stock, days late, price per brand** are computed when shown.
- **Prices are numbers**, OR expiry is a date, encumbrance is picked from a list (one spelling per bank).

What it does for speed: Car status and the New receipt car picker read the database in milliseconds instead of downloading the sheet as CSV from Google every couple of minutes; approving a receipt no longer waits on the Google script to write a status cell; no more cached or stale copies.

## 4. Migration, in steps (each can be undone, the sheet stays read-only archive)

1. **Clean first, in the import, not in the sheet**: skip the test rows; fix the text prices and dates; map the encumbrance spellings; report the rest in a review list like the Docs Bible import.
2. **Import `INVENTORY 2026`** into `car_stock`, matched by plate to the Docs Bible (59 of 63 match; DDZ9807 gets added with Add a car; the odd plate is reviewed by a person). Keep the original row in a `raw` column, like the Docs Bible.
3. **Import repairs (14) and renewals (25)**; the renewals of cars no longer in stock are kept as history.
4. **Switch Car status, the car picker and the receipt approval** to the database. The approval stops writing to the sheet (like the Docs Bible).
5. **Cut-over check** as for the Docs Bible: lock the old workbook and check nobody typed in it.
6. **Archive**: the hidden and stale tabs stay in the old workbook, read-only, nothing imported unless wanted.

## 5. Questions for the owner

1. Who edits the price list every day, and what do they type (price, reprice, remarks, location)? They are the people who must learn the new screen.
2. **ORCR WITH MAD**: is this the transfer of OR/CR to the buyer after a sale? If yes, it should hang on the deal (buyer is already there) as a transfer status with dates and the liaison. Do you want it in the app, or leave it in the sheet?
3. **DOCS column codes** (`C`, `K`, `EW`, `L:SERJEL`, `L:ORCR JUSTINE`): what do they mean (who holds the OR/CR?)? Proposed: a "papers are with" field.
4. **LOCATION** (`ROSE MARY`, `CLEMENTE`, `MANILA UNIT TO CEBU`): is it a person holding the car, a branch or a lot? Proposed: a list the Admin keeps.
5. Do you want **2025 NEW UNITS** (566 arrivals, 366 not in the Docs Bible) imported as history, or archived?
6. **INCOMING CARS** has chassis, engine, MV file no. and owner details that Add a car does not ask for. Should it?
7. Does anything else read this workbook (other sheets by IMPORTRANGE, dashboards, marketing)? Cannot be seen from the file alone.

## 6. Decisions (owner, 19 Nov 2026) and where the build stands

Decisions:
- **DOCS codes** are kept as typed (shown as "Papers with") and each one goes on the review list, so the staff see them and say what they mean.
- **LOCATION** stays as typed; **2025 NEW UNITS** is not imported; **repairs and renewals** are imported.
- **ORCR WITH MAD stays in the Google Sheet**, and nothing will be updated there for the price list (the old workbook is left as it is, for accuracy). The app tells the staff so in a short note on Car status when it switches over.
- **Who edits:** Admin and Approver (price, reprice, location, repair state, notes). Documentation and Sales only look.
- **Connected data:** the car's identity, spare key and OR/CR papers come from the Docs Bible row; the About-the-car answers (spare key, casa maintenance and where, battery, where bought, EV charger and card) come from the car page checklist. The price list does not keep its own copy of any of them. Where the two disagree on import, the review list shows it; nothing is overwritten (only a blank spare key in the Docs Bible is filled from the price list).
- **Excel export:** the same layout as the INVENTORY 2026 tab (columns, headings, body-type heading rows, colours, ₱ and date formats, frozen header, days in stock worked out on the day), plus a second sheet "About the car" with the connected details. Button on Car status for Admin and Approver.

Built so far (nothing in the live app reads it yet): migration 35 (`car_stock`, `car_price_history`, `car_repairs`, `or_renewals`, new review kinds), `scripts/pricelist-snapshot.py` (reads the exported workbook), `scripts/pricelist-apply.ts` (dry run first), the Excel export (`/api/cars/export`).

Still to build, after the owner has compared the Excel export with the sheet: Car status and the car picker reading the database, the edit screen for Admin and Approver, the receipt approval writing to the database instead of the sheet's REMARKS cell, the info note about ORCR WITH MAD, the repairs and renewals screens, and the cut-over check.

How to run the import: `python3 scripts/pricelist-snapshot.py "<the exported .xlsx>"`, then `JITI_ALIAS='{"@/":"<project folder>/src/"}' npx jiti scripts/pricelist-apply.ts` (dry run), then the same with `--apply`. Repeat both whenever the workbook is exported again; the import replaces what an earlier run imported.

## 7. Accuracy check before anything is written (19 Nov 2026)

`scripts/pricelist-verify.ts` compares what the app would show with every cell of the workbook (1,298 cells for the 59 cars that match the Docs Bible): **1,273 are the same; the 25 that differ are all cells the sheet left empty where the Docs Bible knows the value** (3 mileages, 1 fuel, 21 spare keys). Nothing the sheet said is changed. After the import the same script reads the saved rows and also checks the repairs and renewals.

What was found and fixed while checking:
- The price list and the Docs Bible differ in model text (13 cars), mileage (8), encumbrance wording (18) and **arrival date (18 cars, from one day to three weeks apart)**. Instead of picking one silently, the stock row keeps what the price list said (`list_model`, `list_color`, `list_mileage`, `list_fuel`, `list_arrived_on`, `list_encumbrance`) only where it differs, so the export reads like the sheet and days in stock stay what the staff are used to. Real disagreements, and every different arrival date, are one review item per car.
- The renewals tab also had price, target, arrival date, brand, model... for 27 cars (19 of them no longer in the price list). Those cells are now kept in the saved row (`raw`) for repairs and renewals too.
- The sheet's typed 1/0 column D (can be sold) matched the app's rule for 57 of 61 cars; the other 4 are cars with no price yet, so the rule now says "not for sale without a price", and all 59 compared cars match.
- The migration no longer relies on the name of an old check constraint, and the price-history trigger is plain SQL.
- The sheet's REPAIR STATUS column only allows READY TO SELL, SELL AS IS, FOR REPAIR: the edit screen will offer the same three.

Also left out on purpose: column Y (`=TODAY()`), the total row, and the two test rows. All other cells of the three tabs are accounted for.

A decision for the owner: the old workbook cannot be locked as a whole if ORCR WITH MAD stays in it, because the staff must keep updating that tab. Lock only the tabs that moved (INVENTORY 2026, REPAIRS REPORT, FOR RENEWAL and the arrival lists) and leave ORCR WITH MAD open.

## 8. The price list check (a review list of its own, 19 Nov 2026)

Every place where the price list and the Docs Bible do not say the same thing is a row of **Price list check** (`/cars/sync`, opened from Car status; Admin, Approver and Documentation), kept apart from the Docs Bible review list. One row per car and field, with both values side by side:
- **Use the price list's** copies its value into the Docs Bible (changes are in the car's history as "pricelist"); **Use the Docs Bible's** keeps the Docs Bible value and drops the price list's own wording; **Leave as it is** only notes it. Settled rows stay settled when the import is run again.
- The first dry run finds 74 rows: 27 model texts, 17 arrival dates, 5 mileages, 4 colors, 2 statuses (a car Reserved on the price list but Onhand in the Docs Bible), 1 encumbrance, 1 spare key, 2 cars not in the Docs Bible, 3 odd values, and 12 DOCS codes to be explained.
- Until a row is settled, the export and Car status show what the price list showed, so nothing looks different to the staff.

Car status also shows, to everyone, the note "ORCR transfers to buyers are not in MAD. Keep using the 'ORCR WITH MAD' tab of the old MAD PRICE LIST." with a button to open the workbook. To open the tab itself, set `ORCR_SHEET_GID` (the number after `#gid=` in the address while that tab is open) in `/opt/mad-receipts/.env`.
