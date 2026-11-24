# Clean database plan (24 Nov 2026)

Goal: one place for each fact, tables named for what they hold, and the web app reading and writing exactly those places. No data lost: every step is a migration that copies first and drops last, with the old columns kept until the app no longer reads them.

## Where we are (read from the live database)

| Table | Columns | What is wrong |
|---|---|---|
| `docs_units` (the car) | 77 | Identity, registration, papers, price list, state and sheet leftovers in one row. Three statuses (`sale_status`, `vehicle_status`, `stock_state`). Six `list_*` copies of identity fields (`list_model`, `list_color`, `list_mileage`, `list_fuel`, `list_arrived_on`, `list_encumbrance`) that only existed to look like the old price list. OR expiry in three columns (`renewal`, `or_expiry`, `or_expiry_raw`). Notes in three (`remarks_1`, `remarks_2`, `stock_note`). Old sheet paper columns (`cr`, `or_receipt`, `deed`, `sellers_id`, `sec_cert`, `boards_reso`, `chattel`, `promissory`, `stencil`, `other_docs`, `paper_status`) next to the real paper records (`folder_files`). Import leftovers (`raw`, `import_run_id`, `source_row`, `arrival_raw`, `or_expiry_raw`). |
| `car_stock` | 27 | A safety copy of the price list fields that now live on the car. Used by 2 files only. |
| `car_transfers` (the sale and the transfer) | 50 | The sale (buyer, price, sold on, sales person, financing, payment status) and the transfer process (liaison, stage, originals, release, delivery) in one row. Handoff to the processor is stored twice: here (`handed_off_at`, `back_at`, ...) and in `unit_workflow` (`handoff_at`, `handoff_returned_at`, ...). |
| `unit_workflow` | 14 | Approval, notification stamps and the second copy of the handoff. |
| `unit_details` | 4 | The About-the-car answers as one JSON blob, while some answers (spare key) are also car columns. |
| `car_repairs`, `or_renewals`, `car_price_history`, `car_sync_items`, `docs_review_items` | | Fine as separate logs; their names do not say which are logs and which are records. |

## Target: each fact once

| Table | One row per | Holds |
|---|---|---|
| `cars` (today `docs_units`) | arrival of a car | **Everything that is one fact per car, in one row**: identity (plate, brand, make, model year, color, body type, transmission, fuel, mileage), registration (registered owner, LTO office, CS number, chassis, engine, OR expiry), case (classification, encumbrance, buying source, arrival date), sale list (price, target, reprice, retarget, location, tools, state, state note, order, in stock), papers marks, notes. The screens show it in sections, so it reads as one record. |
| `car_papers` (today `folder_files` plus `unit_details`) | paper or answer (repeats, so its own table) | The photos and what was read; the About-the-car answers as rows, not JSON. The old text paper columns go. |
| `car_sales` | sale (a car can be sold again, so it repeats) | Buyer, contact, address, agreed price, sold on, sales person, financing, payment status. |
| `car_transfers` | transfer of one sale | Liaison, stage, originals with, release, delivery, handoff rounds (one place only). |
| Logs: `car_activity`, `car_repairs`, `car_price_history`, `car_or_renewals` | event | Append-only history; never edited. |

## Order of work (each step is one migration and the code that follows it, tested before the next)

1. **Remove duplicates** (no new tables). The register value becomes the only value: the six `list_*` copies are folded into their register fields (a conflict goes to the Data check, nothing is overwritten), then dropped. `sale_status` and `vehicle_status` are dropped and the screens read `stock_state` only. OR expiry becomes one date column. The three note columns become one `notes` (the state note stays with the state). The sheet paper columns and import leftovers are archived to a read-only table and dropped. `car_stock` is dropped (it holds nothing the car does not).
2. **One car record, sections in the app**: the car stays ONE row (no `car_listing` table: price, state and location are one fact per car, so a second table would only add a join). The columns get clear section names in the code (`CAR_SECTIONS`: Identity, Registration, Papers, Sale list), and the car page, Car Inventory and the table read the same section list. Renaming `docs_units` to `cars` is optional and done last, through a view, if wanted.
3. **Split the sale from the transfer**: `car_sales` takes the sale fields, `car_transfers` keeps the process, and the handoff exists only on the transfer (`unit_workflow` keeps approval only).
4. **Papers as rows**: the About-the-car JSON becomes rows; the checklist reads them.
5. **The app mirrors the tables**: the car record page shows the same sections in the same order (Identity, Registration, Papers, Listing and price, Sale, Transfer, History), each section edited in one place, with the same names in Car Inventory, Car documents and Sales.

## Rules for every step
- The owner applies each migration (SQL editor, correct project). I never run one.
- Copy first, drop last: a column is dropped only in the migration after the one that stopped the app reading it.
- A snapshot of the affected tables is taken before each step and the row counts are checked after.
- Tests: the PGlite migration tests, the unit tests and the browser tests for the screens touched.
- `Docs/FEATURES.md` and the code map in `CLAUDE.md` are updated in the same change.

## Progress

**Step 1 (24 Nov 2026), code done and tested; the owner applies the migrations after pushing the code, in this order:**
- 1a `20261124000053_drop_list_copies.sql`: the six `list_*` copies are gone (the car record's own field is the value everywhere; Tidy up no longer compares two copies).
- 1b `20261124000054_one_status_only.sql`: `sale_status` and `vehicle_status` are gone; `stock_state` is the only status and is never empty. The Docs Bible table, its filter, the Data check and the OR digest read the state.
- 1c `20261124000055_one_or_expiry.sql`: `renewal` (text) and `or_expiry_raw` are gone; the OR expiry is the date column `or_expiry` (the table column is called OR EXPIRY and is typed as a date).
- 1e (part) `20261124000056_drop_car_stock.sql`: the old `car_stock` copy is dropped.
- Every dropped value is first kept in `car_dropped_values` (one row per value, read only, never read by the app). It can be removed in a month.

- 1d `20261124000057_one_remarks.sql` (apply BEFORE pushing: it adds the column and joins the two texts) and `20261124000058_drop_old_remarks.sql` (after the push): REMARKS I and II are one `remarks` note.

**Left of step 1, together with retiring the old Docs Bible sheet code** (they are tied to it: `src/lib/docs/bible.ts`, `golive/cutover.ts`, `docsbible/import.ts`, the CSV export): the old text paper columns (`cr`, `or_receipt`, `deed`, ... `paper_status`, `other_docs`) next to the real paper records; the import leftovers (`raw`, `import_run_id`, `source_row`, `arrival_raw`).

**Finding before retiring the old paper columns (24 Nov 2026):** 195 cars have a Yes / No / To follow mark in the old paper columns, and 91 of them have no photo at all in the folders, so those marks are the only record of their papers. Dropping the columns would erase it. Proposed: fold the 13 columns into one read-only `legacy_papers` record on the car ("Papers recorded before MAD"), used only for cars with no photos; the photo checklist stays the truth for everything new. The importer (`docsbible/import.ts`, needed by the 3 no-plate items of the Data check) and the go-live drift check (`golive/cutover.ts`, useful while the sheets are still kept) are still used by live screens, so they are removed only after the sheets are switched off.

**Paper marks (24 Nov 2026, the owner's rule):** the marks stay (CR, OR, deed...). They are never empty: what a person chose always stays; a box nobody has chosen starts as Yes when the paper is in the folder, otherwise No (N/A when the case does not need it). `docsbible/marks.ts`.

**The 24 Nov migrations, in the owner's order:** `Docs/apply-24nov-1-before-push.sql` (before the push), then `Docs/apply-24nov-2-after-push.sql` (after the push). A test applies them in that order on a database with data.

**Step 3 revised (24 Nov 2026):** a sale and its transfer are 1:1 (every sale has exactly one transfer), so, as with the car, a second table would only add a join. They stay ONE record per sale. Done in 3a: the handoff of the originals is kept once, on that record (`20261124000059_handoff_only_on_sale.sql`, file `Docs/apply-24nov-3-after-push.sql`, run after the push). Proposed 3b: rename the table `car_transfers` to `car_sales` (it is one row per sale, and the tab is called Sale and transfer), recreate the two functions that name it, keep a view called `car_transfers` only until the new code is deployed, and show the sale record in the same kind of shared sections (Sale, Payment, Transfer, Handoff) with one name per box.
