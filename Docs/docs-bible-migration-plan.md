# Docs Bible → database: study and migration plan

Written 17 Nov 2026 from a read-only download of the LIVE Docs Bible (kept in `Docs/sheets-private/`, which is git-ignored; nothing was written to the sheet).
Decision (owner): the database becomes the source of truth for the Docs Bible. Staff work only in the web app. The sheet stays as a read-only archive and the app exports the same format as a backup. The MAD Pricelist is left alone for now; only the Docs Bible is migrated.

## 1. What the live workbook really contains

| Tab | Size | What it is |
|---|---|---|
| **DOCS 2026** | 444 data rows × 44 used columns, 400 with a plate | The register. One row per car arrival. |
| **CHANGELOG** | 995 rows | Audit rows written by the bots (When, Plate, Tab, Cell, Field, Before, After, Reason). |
| **AUG, SEPT, OCT, NOV** | 20–60 rows each | Monthly SOLD lists with the follow-up of the papers after the sale (who submitted, status, UPDATES). |
| **2026 NEW UNITS** (trailing space in the name) | 418 rows | A local copy of the arrivals list, with STARTING PRICE and TARGET PRICE. |
| **JAN SALES**, **IN LIEUS** (hidden) | 22 and 9 rows | Old sales/in-lieu notes. Not part of the documents flow. |

### DOCS 2026, column by column

| Cols | Header | Who owns it | Notes |
|---|---|---|---|
| A | (none) | formula `=L2` | A copy of the plate. Not data. |
| B:U | CATEGORY … SPARE KEY (20 columns) | **imported** by one `IMPORTRANGE` in cell B1 from a private "2026 NEW UNITS" sheet | Only the *cached result* is in the file. Our app cannot read the source (401). |
| V | (empty) | | |
| W | VEHICLE STATUS | typed | SOLD / AVAILABLE / SHIPPED TO CEB / NOT FOR SALE. |
| X | CLASSIFICATION | typed | Clean 120, Encumbered (Indiv) 55, Repo (bank) 11. **Blank on 214 of 400 plated rows** (older cars). |
| Y | BANK/SOURCE | typed | Names of people or banks. |
| Z | RENEWAL | typed | Free text/dates. |
| AA | COMPLETE DOCS? | **formula** | COMPLETE / NOT YET, by classification (rules below). |
| AB:AK | CR, OR, DEED OF SALE, SELLER'S ID, SEC CERT, SEC ID'S, BOARDS RESO, Encumbered, CHATTEL, PROMISSORY | typed | Yes / No / To follow / N/A. |
| AL | STENCIL | typed | Yes / N/A. |
| AM | OTHER DOCS ATTACHED | typed | Free text ("CR PHOTOCOPY"). |
| AN | PAPER STATUS | typed | LTO / FOR TRANSFER / RECEIVED … (with trailing-space variants). |
| AO | REMARKS I | typed | Handoff text ("ORIG DOCS AT JEP FOR TRANSFER"), and the bots' dated scan notes. |
| AP | REMARKS II | typed + broken formula | 296 cells hold `=vlookup(A2,Sheet24!A:A,1,false)` and show **#REF!** (the tab `Sheet24` no longer exists). 34 cells hold real typed text. |
| AQ:AT | REMARKS (×4) | empty | |

**The completeness formula (AA)** is the rule the database must reproduce exactly:
- Clean: CR, OR, DEED, SELLER'S ID all Yes.
- Repo (bank): the four above + CHATTEL Yes.
- Encumbered (Indiv): the four + SEC CERT, SEC ID'S, BOARDS RESO each Yes or N/A + Encumbered Yes + CHATTEL Yes.
- Blank classification → blank; anything else → NOT YET.

(Note: today's app checklist asks for the secretary papers on a Repo (bank) car; the sheet formula does not. This must be decided, see §6.)

### The monthly tabs
- Columns A:N (SALES, MARKETING, UNIT, PLATE, SELLING/TARGET/AGREED PRICE, STATUS) are **imported** from another private workbook ("Sept2026_Sold", "Oct2026_Sold", "Nov2026_Sold", "AUG 2026 SALES").
- Columns T:AB are typed by staff: SOLD TO, CONTACT, ADDRESS (customer personal data), DOCS DATE SUBMITTED, DATE RECEIVED, STATUS, REMARKS, and several UPDATES columns that hold the handoff text ("SUBMITTED TO JEP 9/15", "ORIG DOCS RECEIVED FROM JEP 10/21/2026").
- These tabs follow the sale, so most of their content belongs to Sales/the AR in the app, not to the Docs register.

## 2. Problems found (what makes a naive migration inaccurate)

| # | Finding | Count |
|---|---|---|
| 1 | The identity columns B:U exist only as cached results of a private IMPORTRANGE | 400 rows |
| 2 | `#REF!` in REMARKS II from the deleted tab `Sheet24` | 296 cells |
| 3 | Broken imports in AUG/SEPT: the URL starts with `hhttps://` (typo), so the sales-detail columns (AR, AT, SEPT O:R) show `#REF!` | 8 cells |
| 4 | Duplicate plates (a car that arrived twice): NCI3415, NIP3140, TXQ323, NEW3540, NDZ7659 | 5 plates |
| 5 | Rows with data but no plate | 8 rows (100, 142, 146, 364, 376, 383, 392, 401) |
| 6 | CLASSIFICATION blank | 214 plated rows |
| 7 | STATUS (col N) and VEHICLE STATUS (col W) disagree (e.g. "Sold" vs "AVAILABLE") | about 24 rows |
| 8 | DATE ARRIVAL stored as text instead of a date | 19 rows |
| 9 | Unusual plates (not 2–3 letters + 3–4 digits): 136604, LUI86, KG847B, AJD23, TIM89 | 5 |
| 10 | Same value spelled several ways: `W/SPAREKEY`, `W/ SPARE KEY`, `W/ SPAREKEY`; `LTO` / `LTO `; ` NORMAL` | many |
| 11 | CATEGORY holds notes like "DON'T TOUCH THE ROW…" and "CANCELLED TRADE IN" | a few |
| 12 | Handoff text is free typing in different forms | ~100 |

## 3. Target data model (Supabase)

Principles: keep what the sheet knows, nothing is lost, every value that is not a clean choice is kept in a `_raw` text next to the clean one, and every change is recorded.

1. **`docs_units`**: one row per arrival (plate + arrival date), `is_current` = the latest arrival of that plate (the same rule the bots use).
   - Identity: plate_no, plate_display, category, body_type, year_model, make, model_variant, color, mileage, trans, fuel, cs_no, arrival_date (+ arrival_raw), encumbrance, mo_file, reg_owner_name, buying_source, awarded_to, spare_key, vehicle_status, sale_status.
   - Documents: classification, cr, or, deed, sellers_id, sec_cert, sec_ids, boards_reso, encumbered, chattel, promissory, stencil, other_docs_attached, paper_status, bank_source, renewal, remarks_1, remarks_2.
   - Constraints: classification in (Clean, Repo (bank), Encumbered (Indiv)); paper columns in (Yes, No, To follow, N/A); plate normalized (upper case, no spaces).
2. **`docs_complete` (a view)**: reproduces the AA formula exactly, so "COMPLETE / NOT YET" is computed, never typed.
3. **`docs_unit_history`**: who, when, field, before, after, source (`app`, `import`, `sheet-changelog`). Replaces the CHANGELOG tab; the 995 old rows are imported into it as history.
4. **`docs_handoff_events`**: submitted / received, date, to whom, original text. Filled from the monthly tabs' UPDATES text and from the app's handoff step. Text that cannot be parsed is kept as a note, never dropped.
5. **`import_raw_cells`**: every non-empty cell of the snapshot (tab, row, column, value, formula text). This is the safety net: anything not mapped can still be found, and the reconciliation below runs against it.
6. The existing `unit_folders`, `unit_workflow`, `folder_files` link to `docs_units` by plate, so the scan/approve/sold/handoff flow stays as it is.

## 4. How the migration stays accurate

1. **Freeze a snapshot.** Download the live workbook, record its SHA-256 and the time, keep it in private storage. All later steps read the snapshot, never the live sheet.
2. **Load raw.** Every cell into `import_raw_cells`. Formula cells: store the cached value and the formula text.
3. **Normalize in code with tests**: trim, case, plate cleanup, date parsing (the 19 text dates), vocabulary mapping (`W/ SPARE KEY` → `W/SPAREKEY`) while keeping the original in `_raw`.
4. **Validation report** (a page in Admin): duplicates, no-plate rows, odd plates, status disagreements, blank classifications, unparsed dates, unknown values. Nothing is silently fixed.
5. **Reconciliation, cell by cell**: for each source column, count of non-empty cells = count in the database + count in the "not migrated on purpose" list (e.g. `#REF!`, column A). Per-row checksum of the typed columns. The migration is accepted only when every column balances.
6. **Review by staff in the app** (not in the sheet): a short list of exceptions they confirm or fix, each saved with a history entry.
7. **Dry run twice** on the snapshot: the second run must change nothing (idempotent). Then a final run on a fresh snapshot on cut-over day.
8. **Parallel period** (about a week): the sheet stays editable but the app shows a "sheet differs" check on demand, comparing the app with a fresh snapshot, to catch anyone still typing in the sheet.
9. **Cut-over**: the owner makes the sheet read-only by hand and puts a "MOVED TO THE MAD APP" note at the top. No bot writes to the sheet any more. Rollback = export from the app (same format) or the stored snapshot.

## 5. The references we cannot read, and the fix

| Reference | Why it fails | Proposed fix |
|---|---|---|
| **B1 IMPORTRANGE** → private "2026 NEW UNITS" workbook (`1aZUc5zu…`) | The source is not shared by link (HTTP 401); only the owner's Google account can read it. | **One-time**: take the cached values already in the file (they are exactly what staff saw) and cross-check them against the local `2026 NEW UNITS ` tab. **Going forward**: the app becomes the master for new arrivals (an "Add unit" form and a CSV/paste import, with the same 20 fields). If someone must keep maintaining the private sheet, it is shared "view" with the app and the register is refreshed by a read-only sync that only ADDS new plates. |
| **AP `vlookup(A2,Sheet24!A:A…)`** | The tab `Sheet24` was deleted: 296 `#REF!`. It looks like a "is this plate in a list?" check. | Do not migrate the formula or the errors. Keep the 34 real typed REMARKS II texts. Ask the staff what `Sheet24` was (probably "handed to JEP"); the app's handoff status replaces it. |
| **Monthly tabs `hhttps://…` imports** | Typo in the URL (double `h`): `#REF!`. | Not needed after the migration: sales data comes from the app's deals/ARs. If still wanted for now, fix the typo in the sheet by hand. |
| **Monthly tabs A:N imports** from private "Sold" workbooks | Private (401). | Cached values are used once for the history; afterwards Sales data = the app's own deals. |
| **AA COMPLETE DOCS?** | A formula. | Becomes the `docs_complete` view. |

## 6. Decisions needed from the owner/staff before building

1. **Blank classifications** (214 older cars): import as "Not classified (legacy)" and let staff fill them when needed, or have staff classify them first?
2. **Duplicate plates** (5): keep both arrivals as two stints (recommended) or merge?
3. **STATUS vs VEHICLE STATUS** disagree on about 24 rows: which one is true? (Suggestion: keep both as imported, show the disagreement, let staff decide per row.)
4. **Repo (bank) completeness**: the sheet formula needs only CR, OR, DEED, SELLER'S ID + CHATTEL. The app's checklist also asks for secretary papers. Which is right?
5. **Monthly tabs**: migrate only the docs follow-up (submitted, received, status, updates text) and leave customer names/addresses to the AR in the app? (recommended; it keeps customer personal data out of the register)
6. **New arrivals**: who maintains the private "2026 NEW UNITS" source today, and are they willing to enter new units in the app?
7. **Who may edit which columns** (proposal: Documentation edits the document columns, Admin everything, Sales and Approver read-only on a reduced set).
8. **Cut-over date** and who will make the sheet read-only.

### Owner's answers (17 Nov 2026)
1. Blank classification: import as "Not classified (legacy)"; staff fill it in later.
2. Duplicate plates: keep both rows, and put a notice in the staff's review list so they decide later.
3. Status columns that disagree: keep both as imported; staff can always choose what is right, per row.
4. Repo (bank) needs the secretary papers: the database's COMPLETE rule includes SEC CERT and SEC ID'S for Repo (bank) (migration 30).
5. Monthly tabs: migrate only the papers follow-up; customer names and addresses stay with the AR.
6. New arrivals: staff add them in the app, together with the document pictures to Google Drive.
7. Documentation edits the paper columns, Admin everything, Sales and Approver read only; the existing workflow rules stay.
8. Cut-over date: explained to the owner (the day the sheet stops being the place staff work); to be chosen after phase 3.
9. New: STENCIL gets a document type and a picture in the scan, the checklist and the register (not part of COMPLETE, as in the sheet).
Source of truth for the migration: the LIVE Docs Bible only (the copy was for testing and has drifted: 11 cars differ). A fresh snapshot of the live sheet is taken for each dry run and for the final run.

## 7. The new look: familiar, simple, like the sheet

**The Docs Bible page (new)**: the main place staff work, designed to feel like Google Sheets.
- A grid with the **same columns, names and order** as the sheet, a frozen header, and a frozen PLATE column.
- Cells show the same words (Yes / No / To follow / N/A) with calm colour chips (green, red, amber, grey) and a small legend.
- **Click a cell to edit**: choices open a dropdown, free text is typed in place. Arrow keys, Tab and Enter move around like a sheet. Every save is instant, with an Undo toast and "edited by Anna, 2 min ago" on the row.
- **Paste a block** copied from Google Sheets into the grid (dates and Yes/No checked on the way in, mistakes shown before saving).
- Search by plate or name; filter chips (Classification, Complete / Not yet, Vehicle status, "Needs attention"); sort by any column.
- **Saved views** to cut the 44 columns down: "Checklist" (plate + the papers), "Handoff", "Everything (like the sheet)".
- A row opens a side panel with the car's history (replaces the CHANGELOG tab), its photos and its scan result.
- On a phone the rows become cards.
- Help for the change: a one-page "Where did my sheet column go?" guide, a short first-visit tour, and tooltips on each header.
- The existing car page (scan, review, approve, sold, handoff) stays for the step-by-step work, but "Send to sheet" disappears: saving is saving.

Implementation: our own table component (TanStack Table; 400 rows do not need heavy virtualization), server actions with the same role rules and history for every edit.

## 8. Phases

| Phase | Work | Done when |
|---|---|---|
| 0 | This study; owner answers §6 | Decisions written down |
| 1 | Tables, views, snapshot loader, raw import, normalizer with unit tests | Raw import balances 100% |
| 2 | Validation report page + reconciliation + staff exception review | Every column balances; exceptions cleared |
| 3 | The Docs Bible grid page, edit, history, saved views, paste, export (CSV and sheet-format XLSX) | Staff can do a day's work in it |
| 4 | Car page and checklist read/write the database; sheet-editor bot and "Send to sheet" retired; nightly backup export | No code path writes to the sheet |
| 5 | Parallel week, "sheet differs" check, cut-over, sheet read-only | Owner signs off |

Not in scope now: the MAD Pricelist and the Car status module stay as they are; the pricelist's four document cells are simply no longer written by the app.
