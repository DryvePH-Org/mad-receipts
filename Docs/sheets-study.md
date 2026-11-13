# What the Docs Bible and the MAD Pricelist are, and how the grokbot should edit them

Read-only study, 2026-11-13, from exports of: the Docs Bible **live** (`1XorX6s9…`), the Docs Bible **copy** (`1wxJhP3L…`) and the **MAD Pricelist copy** (`1JncMJXH…`). Nothing was edited. (Customer names and addresses are left out of this file on purpose.)

## 1. The Docs Bible workbook

| Tab | What it is |
|---|---|
| **DOCS 2026** | One row per unit bought in 2026: the unit's details on the left, the paper checklist on the right. About 400 units. |
| **AUG, SEPT, OCT, NOV** | One tab per month of **sales**: the unit, the buyer, and the paper trail after the sale (docs submitted, docs received, status, a growing list of dated updates). |
| **CHANGELOG** | An audit log of every change a bot made: About 1,000 lines. Columns: `When, Plate, Tab, Cell, Field, Before, After, Reason`. |
| **2026 NEW UNITS** | A static copy of the buying list (the same columns DOCS 2026 mirrors). |
| JAN SALES, IN LIEUS (hidden) | Old records. Not part of the workflow. |

### DOCS 2026, column by column
- **B:U** (CATEGORY, BODY TYPE, YM, MAKE, MODEL, COLOR, MILEAGE, TRANS, FUEL, **PLATE**, CS NO, STATUS, DATE ARRIVAL, ENCUMBRANCE, MO FILE, REG OWNER, BUYING SOURCE, AWARDED TO, SPARE KEY) are **not typed**. One `IMPORTRANGE` in cell B1 fills them from the buying workbook (`2026 NEW UNITS!A1:T2000`). **A bot never writes here.**
- **A** = `=L` (the plate), the **key** of the row. Formula: never written.
- **W VEHICLE STATUS**: dropdown `AVAILABLE, SOLD, RESERVED, SHIPPED TO CEB` (the sheet also holds `NOT FOR SALE` once).
- **X CLASSIFICATION**: dropdown `Clean, Repo (bank), Encumbered (Indiv)`. Counts: 120 / 11 / 55.
- **Y BANK/SOURCE**: free text (a person's name, a bank, TRADE IN).
- **Z RENEWAL**: a date (OR renewal, 2027 dates).
- **AA COMPLETE DOCS?** is a **formula** (COMPLETE or NOT YET) from the classification:
  - Clean: CR, OR, Deed, Seller's ID all `Yes`.
  - Repo (bank): the same plus CHATTEL `Yes`.
  - Encumbered (Indiv): the same plus SEC CERT, SEC IDS, BOARDS RESO each `Yes` or `N/A`, ENCUMBERED `Yes`, CHATTEL `Yes`.
  - Never written by a bot.
- **AB CR, AC OR, AD DEED OF SALE, AE SELLER'S ID, AF SEC CERT, AG SEC ID'S, AH BOARDS RESO, AI Encumbered, AJ CHATTEL, AK PROMISSORY, AL STENCIL**: dropdowns `Yes, No, To follow, N/A` (OR also allows `FOR RENEWAL`).
- **AM OTHER DOCS ATTACHED**: free text ("CR PHOTOCOPY", "NO CR REGISTERED NAME ID").
- **AN PAPER STATUS**: free text with coloured keywords (PENDING DOCS, FOR SUBMISSION, TRANSFERRED, FINANCING, LTO, LACKING, NO DOCS). Values seen: LTO 68, FOR TRANSFER 17...
- **AO REMARKS I**: the **scan report** a bot wrote (dated, plate and car, then one line per paper: `✅ CR: no. ..., ✅ OR: ..., ✅ DOAS: ...`). **AP REMARKS II** holds dated handoff notes ("SUBMITTED TO JEP 9/23", "ORIG DOCS AT JEP FOR TRANSFER 10/29/26"). Part of AP is a broken formula (`#REF!`, 300 rows, `Sheet24` is gone): leave it alone.

### The monthly tabs (the OUT side)
- Columns C to N (SALES, MARKETING, YM, MAKE, MODEL, TR, PLATE, SELLING/TARGET/AGREED PRICE, FIRM, STATUS) are imported by formula from the sales workbook.
- Typed: **T SOLD TO, U CONTACT, V ADDRESS, W DOCS DATE SUBMITTED, X DATE RECEIVED, Y STATUS (LTO / FINANCING / TRANSFERRED / C/O BUYER), Z REMARKS, AA onward = UPDATES** (many columns, one dated sentence each, e.g. `SUBMITTED TO JEP 9/28`, `ORIG DOCS RECEIVED FROM JEP 11/07/2026`).
- This is exactly the **Handoff** step: submitted date, received date, and the follow-ups.

## 2. The format problem in the copy
In the copy **every `IMPORTRANGE` shows `#REF!`**: the copy tries to read the same source workbooks (`1aZUc5…` buying, `1WK3BQ…` monthly sales, `1wI0am…`), and Google needs someone to press **Allow access** once per pair. Result: columns B:U and the monthly C:N are **empty**, so the plate key (column A) is blank and the typed columns on the right have no unit beside them. The typed data itself is intact (the copy has them). The live workbook already has a few broken imports (`1wI0am…`, `Sheet24`).

Ways to fix the copy for testing (your choice): (a) click **Allow access** on each `#REF!` cell, or (b) paste the values of the mirrored columns (the tab `2026 NEW UNITS` is a ready static copy), so the copy stops depending on the live sources. (b) is safer: the test then cannot be changed by the live sheets.

## 3. The MAD Pricelist
- **INVENTORY 2026**: header on row 2, about 75 units. Columns: `A DOCS` (a short code such as `L:CAMILA`, `C`), `B OR EXP` (date), `C SPAREKEY` (`W/SPAREKEY`, `N/A`), `E` days in inventory, `F YM, G BRAND, H MAKE, I COLOR... M PLATE NUMBER, N PRICE, O TARGET, P DATE ARRIVED, Q/R REPRICE, S REMARKS` (the status text the app writes: `RESERVED - ELLA 11/10`), `T ENCUMBRANCE` (bank), `U TOOLS, V LOCATION, W REPAIR STATUS` (dropdown). Reserved rows are shaded green.
- Other tabs worth knowing: `FOR RENEWAL (2026)`, `ORCR WITH MAD` (papers held by MAD, with buyer and liaison), `2026 NEW UNITS`, `REPAIRS REPORT` (written by the repairs bot).
- Where the documents flow would write: `B OR EXP` (from the OR/renewal date), `C SPAREKEY` (from the staff details), `T ENCUMBRANCE`, maybe `A DOCS`.

## 4. Draft rules for the grokbot (to confirm)
1. **Find the row by plate**, never by row number: DOCS 2026 column L, ignoring spaces and dashes and case. **Zero or several matches means stop and report** (5 plates appear twice today).
2. **Write only the typed cells**: W, X, Y, Z, AB:AN, AO, AP (not the broken formula cells). **Never** A, B:U, AA, or any imported cell, and never insert, delete or sort rows.
3. **Only the allowed values** in dropdown cells (the lists above).
4. **Compare before writing**: the job carries the value the app expects to be there. If the cell differs, write nothing and report the current value.
5. **Log every change in CHANGELOG** (append, never edit): `When` as `13 Nov 2026, 4:38 PM PHT`, plate, tab, cell, field, before, after, reason.
6. **Handoff** goes to the plate's monthly tab: W (submitted date), X (received date), Y (status), and the next empty UPDATES cell with a dated sentence.
7. **Test on the copy only.** The live workbook is never a target until you say so.

## 5. Things to decide
1. **The separate "Docs Automation" project** (`~/Docs Automation`, planned for `docs.dryveph.io`) plans the same IN/OUT flow with its own criteria. Which app is the home of the car documents? Building both would collide.
2. **Cases:** the sheet has `Clean, Repo (bank), Encumbered (Indiv)`; the criteria file (and this app) have `Clean, Encumbered, Repo (Bank), Company`. Where does a company-owned car go in the sheet?
3. **Duplicate plates** (5): a unit sold and bought back? Which row wins?
4. **Which monthly tab** does a sold unit's handoff go to: the month it was sold, or the month the docs were submitted?
5. **A DOCS** in the pricelist: what do the codes mean (`C`, `K`, `EW`, `L:NAME`)? Should the app ever write there?
6. **The copy:** fix with Allow access, or paste values?
