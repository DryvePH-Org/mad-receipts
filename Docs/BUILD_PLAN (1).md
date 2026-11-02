# Acknowledgement of Payment — Build Plan

> For AI coding agents. Work **one phase at a time**, in order. Finish every step, pass the **Done when** checks, commit, then move on. Do not skip ahead. Do not add features that are not in this plan.

---

## 0. What we are building

**Company:** Manila Auto Display (MAD). Pasig Cars is owned by MAD, so there is only one receipt form.

**Problem:** When a customer pays for a car, staff fill out a paper **Acknowledgement of Payment** (a *resibo*). The paper stays the legal record. We want to **photograph it and automate everything after**.

**Flow**

```
Staff photographs paper receipt
  → uploads in webapp
  → Groq vision AI extracts the fields
  → staff reviews / corrects / confirms
  → saved to DB (one Deal, many Receipts)
  → background sync:
        Google Drive (photo)  +  Google Sheets (row)
        Telegram (photo + summary)  +  Inventory status (Reserved / Sold)
```

**Users:** `staff` (upload + confirm) and `admin` (everything, plus void/cancel, users, audit). **No approval step**: staff confirm their own uploads.

---

## 1. Tech stack (locked)

| Layer | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui, **mobile-first** |
| DB / Auth / Storage | **Supabase** (its own NEW project, separate from the inventory app) |
| Validation | Zod |
| AI extraction | **Groq API** (vision model, OpenAI-compatible chat completions) |
| Google | `googleapis` with a service account (Drive + Sheets) |
| Telegram | Bot API (`sendPhoto`), plain `fetch` |
| Tests | Vitest (unit), Playwright (basic e2e) |
| Hosting | Netlify (free tier) |

**Rules for the stack**
- Everything must work on free tiers.
- Money is **never a float**. Use integer **centavos** in code, `numeric(12,2)` in Postgres.
- AI model is behind one function, `extractReceipt(imageBytes)`, so it can be swapped by editing one file.
- Inventory is a **Google Sheet** that staff maintain and can edit anytime. The app reads it **live** and only writes the status cell. It sits behind one interface, `InventoryAdapter`.
- Secrets live only in server-side env vars. Never expose a service key to the browser.

---

## 2. Business rules (source of truth)

### 2.1 Vocabulary
- **Deal** = one sale of one unit to one buyer. Has an agreed price.
- **Receipt** = one payment on a deal. A deal has **many** receipts.
- **Balance** = agreed price − total paid on the deal.

### 2.2 Payment type is COMPUTED, not trusted from the checkbox

For each new receipt:

```
balance_after = agreed_price − (total_paid_before + amount)

if balance_after < 0        → BLOCK (overpayment)
else if balance_after == 0  → "full"
else if first receipt on the deal AND staff marked it as reservation → "earnest"
else                        → "partial"
```

If the type the paper shows (underlined option) differs from the computed type, show a **warning**; the computed type wins.

### 2.3 Deal status and unit status

| Deal state | Deal status | Inventory unit status |
|---|---|---|
| balance > 0 | `open` | **Reserved** |
| balance = 0 | `completed` | **Sold** |
| cancelled by admin | `cancelled` | **Available** |

The unit status is written into the **inventory Google Sheet** (status cell of the plate's row). Staff may also edit that sheet by hand at any time, so the app never caches it.

### 2.4 Cases that must work (use as tests)
1. 50k earnest, then 450k → `earnest`, then `full`. Unit: Reserved → Sold.
2. 100k earnest, 100k, then the rest → `earnest`, `partial`, `full`.
3. 250k on a 500k car, no earnest → `partial`, then `full` later.
4. Buyer backs out after earnest → admin cancels deal, money marked forfeited, unit → Available.

### 2.5 Integrity rules
- `receipt_no` (printed number on the paper, e.g. 2556) is **unique**. Re-uploading the same number is blocked.
- A plate can have only **one open deal** at a time. A new receipt for that plate attaches to it automatically.
- Receipts are **never deleted**, only **voided** (admin). Voiding recomputes the deal.
- Every create / edit / void / cancel writes an **audit log** row.

---

## 3. The paper form (fields to capture)

Header (preprinted): Manila Auto Display · MAD Parking and Management Solutions Inc. · #29 A San Rafael cor. San Clemente St., Brgy. Kapitolyo, Pasig City · **Acknowledgement of Payment** · **No. ####**

| Field | Notes |
|---|---|
| `receipt_no` | Printed red number. Unique key. |
| `receipt_date` | Date at top |
| `buyer_name` | "Received from" |
| `buyer_address` | "Postal address" |
| `buyer_contact` | "Contact no." |
| `amount_words` | "The sum of PESOS" |
| `amount` | Numeric P____ |
| `paper_payment_type` | Underlined: earnest money / partial payment / full payment |
| `make_type` | e.g. 2021 Honda Civic |
| `plate_no` | **Key to inventory** (starred on form). Normalize: uppercase, no spaces/dashes |
| `motor_no`, `chassis_no` | **Optional** (often blank) |
| `color` | |
| `agreed_price` | |
| `less_payment` | |
| `balance` | |
| `payment_method` | cash or check (`check_no`, `bank_branch` if check) |
| `balance_words`, `balance_amount` | "Balance of ____ (P____)" |
| `balance_due_date` | "shall be given on or before" |
| signatures | Buyer + payment-received-by. Captured on paper only; not extracted. |

Fixed footer text (not stored): remarks about forfeiture, "AS IS WHERE IS", note that earnest money / partial payment is non-refundable.

---

## 4. Environment variables

```
# Supabase (this app's own project)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only

# Groq
GROQ_API_KEY=
GROQ_VISION_MODEL=                  # check console.groq.com/docs for the current vision model

# Google (service account)
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_SHEET_ID=                    # receipts log sheet (separate from inventory)

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Inventory = the Google Sheet staff already maintain
INVENTORY_SHEET_ID=
INVENTORY_SHEET_TAB=Inventory
INVENTORY_PLATE_COLUMN=Plate No     # header text of the plate column
INVENTORY_STATUS_COLUMN=Status      # header text of the status column

# Internal
CRON_SECRET=                        # protects /api/sync/run and /api/reminders/run
```

---

## 5. Target folder structure

```
src/
  app/
    (auth)/login/page.tsx
    (app)/layout.tsx
    (app)/page.tsx                    # dashboard
    (app)/upload/page.tsx
    (app)/review/[draftId]/page.tsx
    (app)/deals/page.tsx
    (app)/deals/[id]/page.tsx
    (app)/receipts/page.tsx
    (app)/admin/users/page.tsx
    (app)/admin/audit/page.tsx
    (app)/admin/sync/page.tsx
    api/extract/route.ts
    api/sync/run/route.ts
    api/reminders/run/route.ts
  lib/
    supabase/{client,server,admin}.ts
    extraction/{schema,groq,index}.ts
    rules/{money,words,payment,validate}.ts
    inventory/{types,sheet,mock,index}.ts
    google/{auth,drive,sheets}.ts
    telegram.ts
    sync/{enqueue,process}.ts
  components/
supabase/migrations/
tests/
```

---

# PHASES

## Phase 1 — Project setup

**Goal:** Empty app that runs, lints, and connects to Supabase.

**Steps**
1. Create a Next.js app (App Router, TypeScript, Tailwind, ESLint, `src/` dir).
2. Install: `@supabase/supabase-js @supabase/ssr zod groq-sdk googleapis`, dev: `vitest @playwright/test`.
3. Init shadcn/ui. Add: button, input, label, card, table, badge, dialog, toast, select, tabs.
4. Create the folder structure from section 5 (empty files are fine).
5. Create `.env.local` and `.env.example` from section 4.
6. Create three Supabase helpers: `client.ts` (browser), `server.ts` (server components, cookies), `admin.ts` (service role, server only; add `import "server-only"`).
7. Add a mobile-first base layout with a bottom navigation bar (Home, Upload, Deals, Receipts).
8. Create a NEW Supabase project (separate from the inventory app) and fill the env vars.

**Done when**
- `npm run dev` runs, `npm run build` passes, `npm run lint` passes.
- A test page reads from Supabase without error.

---

## Phase 2 — Database schema and RLS

**Goal:** All tables, constraints, and security policies exist.

**Steps.** Write SQL in `supabase/migrations/` (one file per step) and apply.

1. `profiles` (`id uuid PK → auth.users`, `full_name`, `role text check in ('staff','admin')`, `created_at`). Trigger: auto-create a profile row on new auth user (default role `staff`).
2. `receipt_drafts` (`id`, `photo_path`, `extraction jsonb`, `status` in (`extracting`,`ready`,`failed`,`consumed`), `error`, `created_by`, `created_at`).
3. `deals`:
   `id`, `plate_no` (normalized), `make_type`, `color`, `motor_no`, `chassis_no`, `buyer_name`, `buyer_address`, `buyer_contact`, `agreed_price numeric(12,2)`, `total_paid numeric(12,2) default 0`, `balance numeric(12,2)`, `status` in (`open`,`completed`,`cancelled`), `cancel_reason`, `forfeited boolean default false`, `created_by`, `created_at`, `updated_at`.
   **Partial unique index:** one `open` deal per `plate_no`.
4. `receipts`:
   `id`, `deal_id → deals`, `receipt_no text UNIQUE`, `receipt_date date`, `amount numeric(12,2) > 0`, `payment_type` in (`earnest`,`partial`,`full`), `paper_payment_type`, `payment_method` in (`cash`,`check`), `check_no`, `bank_branch`, `balance_after numeric(12,2)`, `balance_due_date date`, `amount_words`, `balance_words`, `photo_path`, `drive_file_id`, `extraction_raw jsonb`, `status` in (`confirmed`,`voided`), `void_reason`, `created_by`, `created_at`.
5. `sync_jobs`: `id`, `receipt_id`, `target` in (`drive`,`sheets`,`telegram`,`inventory`), `status` in (`pending`,`done`,`failed`), `attempts int default 0`, `last_error`, `next_run_at`, `created_at`, `updated_at`. Unique on (`receipt_id`,`target`).
6. `audit_logs`: `id`, `actor_id`, `action`, `entity`, `entity_id`, `before jsonb`, `after jsonb`, `created_at`.
7. Create a **private** Storage bucket `receipt-photos`.
8. RLS: enable on all tables.
   - Authenticated users can `select` deals, receipts, drafts.
   - Staff can `insert` drafts and `select` own drafts.
   - **Only the confirm RPC (Phase 7) writes to deals/receipts.** No direct insert/update/delete from clients on those tables.
   - Admin can `select` everything, including `audit_logs`, `sync_jobs`.
   - Helper SQL function `is_admin()`.
9. Generate TypeScript types from the schema.

**Done when**
- All migrations apply cleanly on a fresh project.
- Inserting a second open deal for the same plate fails.
- Inserting a duplicate `receipt_no` fails.

---

## Phase 3 — Authentication (before any feature work, so we can test as we go)

**Goal:** Only logged-in users get in; roles work.

**Steps**
1. Supabase Auth: email + password. **Disable public signups** in the dashboard.
2. Build `/login` (mobile-friendly, clear error messages).
3. Add Next.js middleware using `@supabase/ssr`: redirect unauthenticated users to `/login`; redirect logged-in users away from `/login`.
4. Add `getCurrentUser()` server helper returning `{ id, email, role }`.
5. Add `requireAdmin()` helper used by all `/admin/*` pages and admin API routes (returns 403 otherwise).
6. Seed the **first admin** manually: create the user in the Supabase dashboard, then set `role='admin'` in `profiles` (document this in README).
7. Build `/admin/users`: list users; admin can create a staff user (via `admin.ts` service client) and reset a password. Nothing else.
8. Show the user's name and role in the layout header, plus a logout button.

**Done when**
- Logged out → every route redirects to `/login`.
- Staff opening `/admin/users` gets blocked. Admin can open it.
- Admin creates a staff user, who can then log in.

> **From here on, every phase is tested while logged in.** Keep two test accounts: one staff, one admin.

---

## Phase 4 — Rules engine (pure functions + unit tests)

**Goal:** All business logic as tested pure functions. No UI, no DB.

**Steps.** Implement in `src/lib/rules/`, with Vitest tests in `tests/`.

1. `money.ts`: `toCentavos(string|number)`, `fromCentavos(int)`, `formatPeso(int)`. Parse inputs like `"50,000.00"`, `"₱ 50,000"`, `"P50000"`.
2. `words.ts`: `amountToWords(centavos)` → e.g. `"Fifty Thousand Pesos Only"` (handle centavos: `"... Pesos and 50/100 Only"`). `wordsMatchAmount(words, centavos)` tolerant of case, "and", hyphens, minor spelling.
3. `payment.ts`: `computePayment({ agreedPrice, totalPaidBefore, amount, isFirstReceipt, markedReservation })` → `{ balanceAfter, paymentType, error? }` following section 2.2.
4. `validate.ts`: `validateExtraction(data)` returns a list of `{ field, level: 'error'|'warning', message }`:
   - price − payment ≠ balance → warning
   - amount words ≠ amount number → warning
   - balance words ≠ balance number → warning
   - plate missing → error
   - receipt_no missing → error
   - amount ≤ 0 → error
   - paper type ≠ computed type → warning
   - balance due date missing while balance > 0 → warning
   - motor/chassis blank → **no message** (optional)
   - (The "plate found in inventory" check is not here because it needs the sheet. It lives in Phases 7 and 8.)
5. Test the four cases in section 2.4 end to end using `computePayment`.

**Done when**
- `npm test` passes, covering all four cases, overpayment, rounding, and words matching.

---

## Phase 5 — Photo upload

**Goal:** Staff can take a photo and it lands in private storage.

**Steps**
1. Build `/upload`: a big button using `<input type="file" accept="image/*" capture="environment">`, plus a gallery option.
2. Client-side compress before upload: max long edge 1600 px, JPEG quality ~0.8 (use `browser-image-compression`). Keep the result small enough for Groq's request size limit (check Groq docs).
3. Show a preview with **Retake** / **Use photo**.
4. On "Use photo": upload to Storage at `drafts/{userId}/{uuid}.jpg`, insert a `receipt_drafts` row (`status='extracting'`), then call `POST /api/extract` with the draft id.
5. Handle errors: offline, upload failed, file too large. Show friendly messages.

**Done when**
- From a phone browser, the camera opens, a photo uploads, and the draft row and file exist.
- Another staff user cannot read this user's draft photo.

---

## Phase 6 — AI extraction (Groq)

**Goal:** `/api/extract` turns the photo into validated JSON.

**Steps**
1. `src/lib/extraction/schema.ts`: Zod schema `ExtractedReceipt` with all fields from section 3. **Every field is nullable.** Dates as `YYYY-MM-DD`. Amounts as plain numbers (pesos). `paper_payment_type` enum or null. `payment_method` enum or null.
2. `src/lib/extraction/groq.ts`: call Groq chat completions with the image as a base64 data URL and `GROQ_VISION_MODEL`. Use JSON output mode. Temperature 0.
3. **Prompt rules** (put in a constant):
   - You read a handwritten Philippine car-sale "Acknowledgement of Payment" form.
   - Return **only** JSON matching the schema.
   - If a field is blank or unreadable, return `null`. **Never guess.**
   - Plate numbers: letters and digits only.
   - Amounts: digits only, no currency symbols or commas.
   - `paper_payment_type` = the option that is underlined or circled.
   - `payment_method` = the one with the mark (X / check).
4. `src/lib/extraction/index.ts`: `extractReceipt(imageBytes): Promise<ExtractedReceipt>`. Parse with Zod; on invalid JSON, retry once; then fail.
5. `POST /api/extract`: require auth; load the draft (must belong to the caller); download the photo; call `extractReceipt`; run `validateExtraction`; save to `receipt_drafts.extraction` with `status='ready'` (or `failed` with `error`).
6. Never log extracted personal data (names, phone, address). Log only draft id and status.
7. Rate-limit per user (simple: max 20 extractions per hour).

**Reference sample (for testing)** — the provided form should extract roughly as:

```json
{
  "receipt_no": "2556",
  "receipt_date": "2026-11-02",
  "buyer_name": "Jose Rizal",
  "buyer_address": "16 San Fernando, Kapitolyo, Pasig City",
  "amount_words": "Fifty Thousand Only",
  "amount": 50000,
  "paper_payment_type": "earnest",
  "make_type": "2021 Honda Civic",
  "plate_no": "NKF4771",
  "motor_no": null,
  "chassis_no": null,
  "color": "Black",
  "agreed_price": 500000,
  "less_payment": 50000,
  "balance": 450000,
  "payment_method": "cash",
  "balance_words": "Four Hundred Fifty Thousand",
  "balance_due_date": "2026-11-05"
}
```

(Handwriting will vary; the review screen exists for exactly this reason.)

**Done when**
- The sample photo produces a draft with `status='ready'` and mostly correct fields.
- A blurry or blank photo produces `null` fields or `failed`, never made-up data.
- `GROQ_API_KEY` never appears in any client bundle.

---

## Phase 7 — Review screen and confirm

**Goal:** Staff correct the data and confirm. This is the only path that writes deals and receipts.

**Steps**
1. `/review/[draftId]`: on mobile, photo on top (tap to zoom / pinch); editable form below, grouped: **Receipt**, **Buyer**, **Vehicle**, **Payment**, **Balance**. Show a loading state while `extracting`.
2. Pre-fill from `extraction`. Highlight empty required fields.
3. Add a **"This is a reservation (earnest money)"** toggle, defaulting from `paper_payment_type`.
4. On every edit, re-run `validateExtraction` and `computePayment` live. Show:
   - warnings (yellow) and errors (red) next to fields
   - a summary card: **Agreed price · Paid so far · This payment · New balance · Computed type**
5. **Existing deal lookup:** when the plate is entered, look up an open deal for that plate. If found, show "Adding to existing deal" with its totals, and lock buyer/vehicle/price fields to the deal's values (admin can edit later). If not found, show "New deal".
6. Confirm goes through a server route `POST /api/confirm`. It first calls `inventory.getUnit(plate)`; if the plate is **not found in the inventory sheet, reject** and save nothing. Then it calls the Postgres function `confirm_receipt(draft_id, payload jsonb)` (`SECURITY DEFINER`, one transaction):
   1. Validate the draft belongs to the caller and is `ready`.
   2. Re-run the payment rules server-side (never trust the client's computed numbers).
   3. Find the open deal by plate, or create one.
   4. Insert the receipt (fails on duplicate `receipt_no`).
   5. Update the deal: `total_paid`, `balance`, `status` (`completed` when balance = 0).
   6. Move the photo from `drafts/` to `receipts/{receipt_no}.jpg`.
   7. Mark the draft `consumed`.
   8. Insert `sync_jobs` for `drive`, `sheets`, `telegram`, `inventory`.
   9. Insert an `audit_logs` row.
7. The **Confirm** button is disabled while any **error** exists (including **"Plate not found in inventory"**). Warnings can be confirmed after an explicit tick: "I checked the warnings".
8. After success: show a success screen with receipt no., type, new balance, unit status, and buttons **Upload another** / **View deal**.

**Done when**
- Case 1 and Case 2 from section 2.4 work end to end in the DB (deal totals and statuses correct).
- A duplicate `receipt_no` is rejected with a clear message.
- Overpayment is rejected.
- Two simultaneous confirms for the same plate cannot corrupt totals.
- A plate that is not in the inventory sheet cannot be confirmed (blocked in the UI and on the server).

---

## Phase 8 — Inventory (Google Sheet)

**Goal:** Read and update unit status in the inventory Google Sheet that staff already maintain. Staff can edit that sheet at any time, so the app **always reads it live** and **only writes the status cell**.

**Steps**
1. `src/lib/inventory/types.ts`:
   ```ts
   export type UnitStatus = "Available" | "Reserved" | "Sold";
   export interface InventoryAdapter {
     getUnit(plate: string): Promise<{ plate: string; status: string; makeType?: string; color?: string } | null>;
     setStatus(plate: string, status: UnitStatus, ref: { receiptNo: string }): Promise<void>;
   }
   ```
2. `sheet.ts` (the real adapter), using the Google service account and Sheets API:
   - `getUnit(plate)`: read the plate and status columns of `INVENTORY_SHEET_TAB` (columns found by the header text in env). Match plates after normalizing both sides (uppercase, no spaces or dashes). Return the unit or `null`.
   - `setStatus(plate, status, ref)`: **find the row again at write time** (rows may have moved), then update **only that row's status cell**. Never write any other cell. Never insert, delete or reorder rows.
   - Status words are constants in one place (`Available`, `Reserved`, `Sold`) and must match what staff type in the sheet.
   - No caching. Every read is live.
3. `mock.ts`: in-memory adapter for unit tests only.
4. `index.ts`: exports `inventory` (the sheet adapter). Tests inject the mock.
5. Review screen: when the plate is entered (debounced), call `getUnit`:
   - **Found** → show "Unit found: {make}, {color}, status {status}".
   - **Not found** → **error**: "Plate not found in the inventory sheet. Check the plate, or add the unit to the sheet first." **Confirm stays blocked.**
   - Found but status is `Sold` and this app has no open deal for it → **warning**: "Unit is already marked Sold in inventory."

**Done when**
- With the inventory sheet shared to the service account, typing a real plate shows its status.
- An unknown plate blocks confirm, in the UI and on the server.
- Confirming a receipt changes only the status cell: `Reserved`, then `Sold` on full payment.
- If staff edit the sheet by hand, the next read shows the new value.

---

## Phase 9 — Background sync (Drive, Sheets, Telegram, Inventory)

**Goal:** After confirm, everything else happens automatically and reliably.

**Steps**
1. `sync/process.ts`: `processDueJobs()` loads `pending`/`failed` jobs where `next_run_at <= now()` and `attempts < 5`, runs each by `target`, then marks `done` or records `last_error`, increments `attempts`, and sets exponential backoff (1 min, 5 min, 15 min, 1 h, 6 h).
2. **drive:** upload the photo to `GOOGLE_DRIVE_FOLDER_ID` named `{receipt_no}_{plate}.jpg`; save `drive_file_id`.
3. **sheets:** append a row to the **Receipts** tab (columns below). Upsert the deal's row in the **Deals** tab (match by Deal ID).
   - Receipts tab: `Timestamp, Receipt No, Date, Buyer, Address, Contact, Plate, Make/Type, Color, Motor, Chassis, Payment Type, Amount, Agreed Price, Total Paid, Balance, Method, Check No, Bank/Branch, Balance Due Date, Photo Link, Confirmed By, Status`
   - Deals tab: `Deal ID, Plate, Buyer, Agreed Price, Total Paid, Balance, Status, Last Receipt No`
4. **telegram:** `sendPhoto` to `TELEGRAM_CHAT_ID` with a caption:
   `🧾 Receipt #2556 · EARNEST` / `Jose Rizal` / `2021 Honda Civic · NKF4771` / `Paid ₱50,000 · Balance ₱450,000 · Due Nov 5, 2026` / `Unit: Reserved`
5. **inventory:** call `inventory.setStatus(plate, statusFromDeal, { receiptNo })` (writes only the status cell in the inventory sheet).
6. Jobs are **idempotent**: re-running a `done` job does nothing; Sheets append checks for an existing `Receipt No` row first.
7. `POST /api/sync/run`: protected by `CRON_SECRET`; calls `processDueJobs()`. Also call it (fire and forget) right after a successful confirm so sync feels instant.
8. A failed Google or Telegram call must **never** roll back the saved receipt.

**Done when**
- Confirming a receipt results in: photo in Drive, row in Sheets, message in Telegram, inventory sheet status updated.
- Turning off the network for Google (bad key) leaves the receipt saved and the job `failed` with a readable error; fixing the key and re-running completes it.

---

## Phase 10 — Lists, search, and deal pages

**Goal:** Staff can find anything fast.

**Steps**
1. `/deals`: table/cards with plate, buyer, price, paid, balance, status badge (Reserved / Sold / Cancelled). Search by plate or buyer. Filter by status. Sort by latest.
2. `/deals/[id]`: deal summary, **timeline of receipts** (receipt no., date, amount, type, photo thumbnail that opens full photo via signed URL), remaining balance, next due date.
3. `/receipts`: flat list, search by receipt no., buyer, or plate; filter by type and date range.
4. `/` dashboard: counts (open deals, completed this month), **due soon / overdue** list (balance due date within 3 days or past), and a recent receipts list.
5. Keep it fast: paginate (25 per page); index `plate_no`, `receipt_no`, `balance_due_date`.

**Done when**
- Searching a plate shows the whole deal history with photos.
- Overdue deals show clearly on the dashboard.

---

## Phase 11 — Admin tools

**Goal:** Handle mistakes and back-outs safely.

**Steps** (all require `requireAdmin()`, all write `audit_logs`)
1. **Void receipt** (with reason): marks the receipt `voided`, recomputes the deal's totals, status, and unit status, enqueues sheets/telegram/inventory sync. Block voiding if it would leave the deal inconsistent (e.g. voiding an early receipt while later ones exist: require voiding from the latest backward).
2. **Cancel deal** (with reason + "forfeit money" toggle): deal → `cancelled`, unit → Available, Telegram notice, Sheets status updated.
3. **Edit deal details** (buyer name/address/contact, vehicle info) with before/after audit.
4. `/admin/audit`: filterable audit log (actor, action, entity, date).
5. `/admin/sync`: list failed/pending jobs with `last_error` and a **Retry** button.
6. **Balance reminders:** `POST /api/reminders/run` (protected by `CRON_SECRET`) sends one Telegram message listing deals due today or overdue. Schedule it daily at 8:00 AM Asia/Manila.

**Done when**
- Case 4 from section 2.4 works fully.
- Staff cannot reach any of these actions (UI hidden **and** server blocked).
- Retry fixes a previously failed job.

---

## Phase 12 — Testing and hardening

**Goal:** Trust it with real money records.

**Steps**
1. Unit tests: keep Phase 4 tests green. Add tests for `confirm_receipt` outcomes via a test database or SQL tests.
2. Playwright e2e: login → upload sample photo (mock Groq) → review → confirm → see deal. Also: staff blocked from admin; duplicate receipt no.
3. RLS tests: staff cannot read another user's drafts; nobody can write deals/receipts directly from the client.
4. Input limits: max photo size, allowed MIME types, max text lengths.
5. PII: confirm no names/phones/addresses appear in server logs.
6. Error states: Groq down, Google down, Telegram down, Supabase slow. Each shows a clear message and nothing is lost.
7. Real-world test: run **10 real paper receipts** (various handwriting, glare, angle). Record accuracy per field. If a field is often wrong, improve the prompt or photo guidance (e.g., "fill the frame, avoid glare").
8. Add a short in-app **photo tips** card on `/upload`.

**Done when**
- All tests pass.
- 10 real receipts processed; every wrong extraction was caught by the review screen.

---

## Phase 13 — Deployment

**Goal:** Live on free hosting.

**Steps**
1. Push to GitHub. Create a Netlify site from the repo; set all env vars from section 4.
2. Supabase production settings: Site URL and redirect URLs set to the live domain; public signups still **disabled**; confirm RLS is on for every table.
3. Set the `INVENTORY_*` env vars to the real inventory sheet.
4. Schedule cron calls (Netlify scheduled function, or an external free scheduler) to hit `/api/sync/run` every 5 minutes and `/api/reminders/run` daily at 8:00 AM Asia/Manila, with the `CRON_SECRET` header.
5. Share the Google Drive folder, the receipts log sheet and the inventory sheet with the service account email (**Editor**). Add the Telegram bot to the group and confirm the chat id.
6. Smoke test on the live site: login, upload, confirm, check Drive, Sheets, Telegram.
7. Write a one-page **README**: env vars, how to create the first admin, how to add staff, how to retry failed syncs, how to rotate keys.

**Done when**
- A real receipt goes from phone photo to Sheets row and Telegram message on the live URL.

---

## Open items (need the owner's answer; do not guess)

1. **Inventory sheet layout:** the tab name, the header text of the plate column and of the status column, and the exact status words staff use. (Assumed: tab `Inventory`, columns `Plate No` and `Status`, words `Available`, `Reserved`, `Sold`.)
2. **Groq vision model and limits.** Verify the current model name, image size limit and free-tier rate limits in Groq's docs before Phase 6.

---

## Global rules for the coding agent

- One phase at a time. Commit after each step with a clear message.
- Never put secrets in client code. Never log personal data.
- Money in centavos (integers) in code. No floats.
- All writes to deals/receipts go through `confirm_receipt` or admin RPCs. No ad-hoc client writes.
- Keep the AI model and inventory behind their adapters.
- When a requirement is unclear, add it to **Open items** and ask. Do not invent behavior.
- Keep the UI mobile-first, large tap targets, clear error messages in plain language.
