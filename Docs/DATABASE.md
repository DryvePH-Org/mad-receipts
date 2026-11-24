# The database in one page (24 Nov 2026)

One fact lives in one place. A **car** is one row (everything that is one fact per car), a **sale** is one row (the sale and its transfer), and what repeats for a car (photos, repairs, history) has its own table. The web app shows each of them in the same sections with the same names (`src/lib/cars/sections.ts` for the car, `src/lib/sales/sections.ts` for the sale). A test (`tests/db/column-guard.test.ts`) fails when a column is added without a name.

## The car: `docs_units` (view `docs_units_current` = the latest arrival of each plate)
| Section on screen | Columns |
|---|---|
| Who the car is | `plate_no` (key), `plate_display`, `category`, `year_model`, `make` (Brand), `model_variant` (Make), `color`, `body_type`, `trans`, `fuel`, `mileage`, `spare_key` |
| Registration | `reg_owner_name`, `mo_file`, `cs_no`, `chassis_no`, `engine_no`, `or_expiry` (a real date) |
| Buying and case | `arrival_date`, `buying_source`, `awarded_to`, `classification` (Case), `bank_source`, `encumbrance` |
| Papers | the marks `cr`, `or_receipt`, `deed`, `sellers_id`, `sec_cert`, `sec_ids`, `boards_reso`, `encumbered`, `chattel`, `promissory`, `stencil` (never empty: see `docsbible/marks.ts`), `papers_with`, `registry_of_deeds`, `paper_status`; "complete" is worked out |
| Status and price | `stock_state` (the ONE status), `state_for`, `state_on`, `list_price`, `target_price`, `reprice`, `retarget`, `location`, `tools`, `stock_note`, `in_stock`, `stock_order`, `body_group` |
| About the car | `owner_no`, `casa_maintained`, `casa_when`, `casa_where`, `battery_when`, `bought_from`, `ev_type`, `wall_charger`, `portable_charger`, `key_card`, `charging_card`, `condition_note` |
| Notes | `remarks` (one note) |
| Internal | `id`, `source`, `import_run_id`, `source_row`, `raw`, `arrival_raw`, `created_by`, `updated_by`, `last_change_source`, `created_at`, `updated_at`, `archived_at`, `archived_by` |

## The sale: `car_sales` (one row per sale, with its transfer)
Sale (`buyer`, `address`, `contact`, `sold_on`, `agreed_price`, `sales` = Salesperson, `financing`), Payment (`payment_status`, `balance`), Transfer (`route`, `stage`, `liaison`, `particular`, `cr_date`, `transaction_date`, `next_step`), The originals (`originals_at`, `handed_off_at`, `back_at`, `released_on`, `delivered_on`, `done_on`), Notes (`note`). A sale of a car that is not in the register keeps the car as the sheet described it (`car_text`, `chassis_no`, `engine_no`).

## What repeats for a car, each in its own table
| Table | One row per |
|---|---|
| `folder_files` | photo or paper of a car (what the bot read, its type, who uploaded it, payment papers are `archive` rows) |
| `unit_folders` | the car's Drive folder (case chosen by the staff) |
| `unit_workflow` | the car's approval and notification stamps |
| `car_repairs` | repair job |
| `car_price_history`, `docs_unit_history` | change of a price, change of a box of the car record |
| `or_renewals` | OR renewal step |
| `docs_review_items`, `car_sync_items` | decision waiting in the Data check |
| `docs_handoff_events` | old handoff events from the sheet (history) |
| `deals`, `deal_units`, `receipts`, `receipt_payments`, `attachments` | receipts side (hidden for now) |
| `audit_logs` | everything anybody did (feeds the activity history of a car) |
| `car_dropped_values` | every value the clean-up removed, kept read-only (see below) |

## The clean-up of 24 Nov 2026 (what was removed, and where the old values are)
Removed: the six `list_*` copies, `sale_status` and `vehicle_status` (the one status is `stock_state`), `renewal` and `or_expiry_raw` (the OR date is `or_expiry`), `remarks_1` and `remarks_2` and `other_docs` (one `remarks`), the `car_stock` table, the handoff columns of `unit_workflow` (the handoff is on the sale), the `unit_details` blob (columns of the car). `car_transfers` is now `car_sales`.
Every removed value is in `car_dropped_values` (column name, plate, value, why). It can be deleted about a month after the owner has checked nothing is missed.
