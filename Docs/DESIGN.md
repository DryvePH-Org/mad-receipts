# Design guide

How this app looks, how it adapts to screens, and **where new code belongs**.
Read this before adding a page or component so it matches what is already here.

Contents

1. [Design principles](#1-design-principles)
2. [Stack and libraries](#2-stack-and-libraries)
3. [Design tokens](#3-design-tokens)
4. [Layout and the app shell](#4-layout-and-the-app-shell)
5. [Responsive behaviour](#5-responsive-behaviour)
6. [Component catalogue](#6-component-catalogue)
7. [Page patterns](#7-page-patterns)
8. [Where things go (architecture)](#8-where-things-go-architecture)
9. [How to build a new feature](#9-how-to-build-a-new-feature)
10. [Forms, validation and errors](#10-forms-validation-and-errors)
11. [Accessibility, motion and print](#11-accessibility-motion-and-print)
12. [PWA and branding](#12-pwa-and-branding)
13. [Rules of thumb and known gaps](#13-rules-of-thumb-and-known-gaps)

---

## 1. Design principles

- **Calm and neutral.** A black-and-white ledger look (neutral greys, one dark
  primary). Colour is rare and always means something: status, warning, error.
- **Money is the hero.** Amounts use tabular numbers, are right-aligned in tables
  and are never truncated.
- **Phone first for the people holding cash.** Custodians work from a phone: big
  cards, a bottom tab bar, bottom sheets, camera-friendly uploads. Desks get a
  sidebar and tables.
- **One screen, one job.** A page has a title, one short description and a small
  set of actions in the header. Everything else is cards.
- **Safe by default.** Anything irreversible (release cash, void, approve) goes
  through a confirm dialog that says what will happen.
- **No surprises with data.** Pages render per request (no static caching) because
  the content is private and changes constantly.

## 2. Stack and libraries

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 App Router, React 19, TypeScript. Server components by default. |
| Styling | Tailwind CSS v4 (tokens in `src/app/globals.css`, no `tailwind.config`). |
| Components | shadcn/ui, style **base-nova**, built on **Base UI** (`@base-ui/react`) primitives. |
| Icons | `lucide-react` (`size-4` inline, `size-5` in tiles/nav). |
| Forms | `react-hook-form` + `zod` via `@hookform/resolvers`. |
| Toasts | `sonner` (top-center). |
| Charts | `recharts` (reports only). |
| Fonts | Geist Sans and Geist Mono through `next/font` (self-hosted). |
| Class helper | `cn()` from `src/lib/utils.ts` (clsx + tailwind-merge). |

Base UI note: a "render as a link" button is written
`<Button nativeButton={false} render={<Link href="..." />}>`. It then exposes
`role="button"`, which matters for tests.

## 3. Design tokens

All tokens are CSS variables in `src/app/globals.css`, using the OKLCH colour
space. Use the Tailwind names (`bg-primary`, `text-muted-foreground`), never raw
colours, except for status badges (section 6).

### Colour (light theme)

| Token | Value | Use |
| --- | --- | --- |
| `background` / `foreground` | white / near-black `oklch(.145 0 0)` | Page and text |
| `card` | white | Cards, popovers, dialogs |
| `primary` | `oklch(.205 0 0)` (near-black) | Main buttons, logo tile, selected states |
| `primary-foreground` | `oklch(.985 0 0)` | Text on primary |
| `secondary`, `muted`, `accent` | `oklch(.97 0 0)` | Soft fills, hover, tiles |
| `muted-foreground` | `oklch(.556 0 0)` | Secondary text, hints, labels |
| `border`, `input` | `oklch(.922 0 0)` | Dividers, field borders |
| `ring` | `oklch(.708 0 0)` | Focus ring (3 px, 50 % opacity) |
| `destructive` | `oklch(.577 .245 27.3)` (red) | Errors, destructive actions |
| `sidebar*` | slightly off-white | Desktop sidebar |
| `chart-1..5` | greys | Reserved; charts currently use `primary` |

### Dark theme

A full `.dark` palette is defined (near-black background, lighter primary) and
status badges have `dark:` variants, but **dark mode is not switched on**: there
is no theme provider or toggle. Keep writing `dark:` variants where a colour is
hard-coded so enabling it later is a small job.

### Radius

`--radius: 0.625rem`. Scale: `sm 0.6×`, `md 0.8×`, `lg 1×`, `xl 1.4×`,
`2xl 1.8×`. In practice: fields and buttons `rounded-lg`, cards `rounded-xl`,
bottom sheets `rounded-t-2xl`, badges fully round (`rounded-4xl`).

### Elevation

Almost flat. Cards use a 1 px ring (`ring-1 ring-foreground/10`), not a shadow.
Shadows appear only on floating layers (dialogs, sheets: `shadow-lg`). The
frosted bars use `bg-background/95 backdrop-blur`.

### Typography

One family (Geist). Scale actually used:

| Role | Classes |
| --- | --- |
| Page title | `font-heading text-2xl font-semibold tracking-tight text-balance` |
| Login hero | `text-4xl font-semibold tracking-tight` (desktop panel only) |
| Card title | `text-base font-medium` (CardTitle) |
| Body | `text-sm` |
| Secondary / hint | `text-sm` or `text-xs` with `text-muted-foreground` |
| Nav group label | `text-[11px] font-medium tracking-wider uppercase` |
| Tab-bar label | `text-[11px] font-medium` |
| Money, codes | `tabular-nums` (`MoneyText`), `font-mono` for PCV numbers |

Inputs are `text-base` on phones and `md:text-sm` from 768 px up. This is on
purpose: 16 px stops iOS Safari from zooming when a field is focused.

### Spacing

Tailwind's 4 px scale. The rhythm that repeats everywhere:

- Page sections: `space-y-6`. Inside a card: `space-y-3` to `space-y-5`.
- Card padding: `--card-spacing` = 16 px (12 px for `size="sm"`).
- Grids: `gap-6` between cards, `gap-4` between fields, `gap-2` between buttons.
- Main content padding: `px-4 py-6` → `sm:px-6` → `lg:px-8 lg:py-10`.

### Iconography and motion

- Lucide only, stroke icons, `size-4` beside text, `size-5` in nav and tiles, in
  a `size-8`–`size-11` rounded `bg-muted` tile for emphasis.
- Motion is minimal: 150–200 ms transitions on hover/open, a 1 px press
  (`active:translate-y-px`) on buttons, a spinner (`Loader2` + `animate-spin`),
  and the receipt-reading **scan sweep** (`.scan-sweep` in `globals.css`), which
  stops under `prefers-reduced-motion`.

## 4. Layout and the app shell

`src/app/(app)/layout.tsx` checks the signed-in user and wraps every page in
`AppShell` (`src/components/layout/app-shell.tsx`). Signed-out pages live in
`src/app/(auth)/`.

```
≥ 1024 px (lg)                          < 1024 px
┌──────────┬───────────────────────┐    ┌───────────────────────┐
│ Sidebar  │  main (max-w-6xl)     │    │ Top bar  (h-14)       │
│ w-64     │  PageHeader           │    ├───────────────────────┤
│ fixed    │  content cards        │    │  main (px-4, pb-28)   │
│          │                       │    │  PageHeader + cards   │
└──────────┴───────────────────────┘    ├───────────────────────┤
  content shifted by lg:pl-64             │ Bottom tab bar (h-16) │
                                          └───────────────────────┘
```

- **Sidebar** (`sidebar-nav.tsx`): fixed, 16 rem wide, logo block, nav groups
  ("Operations", "Administration") with active-item highlight, user menu at the
  bottom. Visible only at `lg`.
- **Top bar** (mobile): sticky, 3.5 rem, logo and compact user menu.
- **Bottom tab bar** (`bottom-tab-bar.tsx`): fixed, 4 rem plus
  `env(safe-area-inset-bottom)` for iPhone home bars. Shows the first four nav
  items for the role; a fifth **More** opens a bottom sheet with the rest. The
  main area has `pb-28` so nothing hides behind it.
- **Navigation per role** is data, not markup: `src/lib/navigation.ts` filters
  items with `canAccessRoute` from `src/lib/permissions.ts`.
- **Content width**: `max-w-6xl` centred. Print removes the cap and padding.

Every page starts with the same header:

```tsx
<div className="space-y-6">
  <PageHeader title="Vouchers" description="…" actions={<Button>…</Button>} />
  {/* cards, lists, forms */}
</div>
```

`PageHeader` stacks on phones and puts the actions to the right from `sm`;
actions wrap (`flex-wrap`) so three buttons never overflow a 390 px screen.

## 5. Responsive behaviour

**Mobile first.** Base classes are the phone layout; `sm:`, `md:`, `lg:` add to
it. There is no `max-*` desktop-first logic except one deliberate case
(`max-sm:` for the bottom-sheet dialog).

### Breakpoints in use

| Breakpoint | Width | What changes |
| --- | --- | --- |
| *(base)* | 0–639 | Single column, bottom tab bar, cards instead of tables, full-width bottom-sheet dialogs |
| `sm` | ≥ 640 | Wider page padding, two-column field grids and detail lists, dialogs become centred (max 32 rem), header actions sit beside the title |
| `md` | ≥ 768 | Two-column dashboard grids; inputs shrink to `text-sm` |
| `lg` | ≥ 1024 | **The main switch**: sidebar replaces top bar and tab bar, tables replace card lists, two-pane layouts appear |
| `xl` | ≥ 1280 | Only extra padding on the login panel |

Usage counts across the code: `sm` 55, `lg` 21, `max-sm` 8, `md` 5, `xl` 1.
**`lg` is the one that matters**: if you build something that differs between
phone and desktop, switch at `lg`.

### Patterns that make a page responsive

| Pattern | Phone | Desktop |
| --- | --- | --- |
| `ResponsiveList` (`shared/responsive-list.tsx`) | Stack of cards from `renderCard` | A real table from `columns`, `hidden lg:block` |
| `ResponsiveDialog` (`shared/responsive-dialog.tsx`) | Bottom sheet, full width, `rounded-t-2xl`, max 85 svh | Centred dialog, `sm:max-w-lg` |
| Two-pane detail (`vouchers/[id]`, `replenishments/[id]`) | One column | `lg:grid-cols-[minmax(0,1fr)_22rem]`: content left, actions/timeline right |
| Master–detail (`approvals-board.tsx`) | Cards; tapping opens a right-side `Sheet` (full width, `sm:` 32 rem) | `lg:grid-cols-[20rem_minmax(0,1fr)]` list beside the selected voucher |
| Navigation | Top bar + bottom tab bar | Fixed sidebar |
| Login (`(auth)/login`) | Form only | `lg:grid-cols-2`: brand panel on the left, form on the right |
| Detail lists (`<dl>`) | 1 column | `sm:grid-cols-2` |
| Dashboard cards | 1 column | `md:grid-cols-2` |
| Charts | `ResponsiveContainer` width 100 %, fixed height 280 | Same |

### Rules every page must follow

1. **No horizontal page scroll** at 390 px or 1280 px. This is tested:
   `e2e/layout.spec.ts` opens every page at both sizes (Playwright projects
   `desktop` 1280×900 and `mobile` 390×844 with touch).
2. Use `min-w-0` on flex/grid children that hold text so long names truncate
   instead of stretching the row; use `truncate` for single-line text.
3. Wide tables scroll inside their own container (`Table` wraps itself in
   `overflow-x-auto`), never the page.
4. Use `svh` units (`min-h-svh`, `max-h-[85svh]`), not `vh`, so mobile browser
   bars do not hide content.
5. Fixed bars respect the iPhone safe area (`env(safe-area-inset-bottom)`).
6. Header actions use `flex-wrap`; buttons in forms stack on phones
   (`flex-col-reverse sm:flex-row`, primary action last on desktop, first on top
   of the stack on phones).
7. Photo inputs use `capture="environment"` so phones open the camera; desktop
   also supports drag-and-drop.

## 6. Component catalogue

### Primitives (`src/components/ui/`) — shadcn, do not restyle ad hoc

| Component | Notes |
| --- | --- |
| `Button` | Variants: `default` (primary), `outline`, `secondary`, `ghost`, `destructive` (soft red fill), `link`. Sizes: `xs`, `sm`, `default` (h-8), `lg` (h-9), `icon`, `icon-xs/sm/lg`. Disabled = 50 % opacity. Pass icons as children (auto-sized). |
| `Input`, `Textarea`, `Select` | `h-8` fields, `rounded-lg`, 3 px focus ring, red ring when `aria-invalid`. |
| `Label`, `Field` | Label above field. Error text below in `text-xs text-destructive`. |
| `Card` (+ `CardHeader/Title/Description/Action/Content/Footer`) | The container for everything. `size="sm"` tightens padding. |
| `Badge` | Variants `default`, `secondary`, `destructive`, `outline`, `ghost`. |
| `Alert` | Inline message; `variant="destructive"` for errors. |
| `Dialog`, `Sheet` | Base for the shared wrappers below. `Sheet` sides: bottom, right, left, top. |
| `Table` | Self-scrolling; used only through `ResponsiveList` on desktop. |
| `Tabs`, `DropdownMenu`, `Separator`, `Skeleton`, `Sonner` | As in shadcn. |

Add new primitives with the shadcn CLI so they match the config in
`components.json` (base-nova, lucide, `@/components/ui`).

### Shared building blocks (`src/components/shared/`) — use these first

| Component | Use it for |
| --- | --- |
| `PageHeader` (in `layout/`) | Title, description and header actions of every page |
| `ResponsiveList` | Any list that is a table on desktop and cards on phones |
| `ResponsiveDialog` | Any form or detail in a modal |
| `ConfirmDialog` | "Are you sure?" for a single irreversible step |
| `ReasonDialog` | Confirmation that needs a typed reason (flag, return, void) |
| `EmptyState` | A dashed card with icon, title and one helpful sentence, used when a list or setup is empty |
| `MoneyText` | **Every** peso amount: `tabular-nums` + `formatPHP` |
| `StatusBadge` / `ReplenishmentStatusBadge` | Status pills with fixed colours (below) |
| `CsvExportButton` | Export of what is on screen (formula-safe) |
| `PageSkeleton` | The `loading.tsx` placeholder |

### Status colours

Soft pill: light tint background, dark text, no border (`border-transparent`),
with `dark:` variants. The meaning is consistent across the app.

| Voucher status | Label | Colour |
| --- | --- | --- |
| draft | Draft | grey (`muted`) |
| submitted | Awaiting approval | amber |
| released | Released | violet |
| approved | Approved | teal |
| closed | Closed | emerald |
| rejected | Flagged | red |
| void | Void | zinc |

Replenishment statuses reuse the palette (submitted = **sky**, to tell it apart
from a voucher awaiting approval). Amber is also the "needs attention" colour for
the AI-reading note and the approval-required hint; red is only for errors and
flags; the destructive button is a soft red fill, not solid.

### Feature components (`src/components/<feature>/`)

| Folder | Contents |
| --- | --- |
| `vouchers/` | `voucher-form` (create/edit), `voucher-actions` (state-driven action card), `receipt-uploader`, `receipt-viewer`, `paper-voucher-scanner`, `scan-progress`, `voucher-print`, `types.ts` |
| `approvals/` | `approvals-board` (master–detail + sheet), `types.ts` |
| `replenishments/` | list, detail and action components, `types.ts` |
| `dashboard/` | `balance-card` (imprest equation, progress bar, low-balance badge) |
| `admin/` | managers and form dialogs for users, funds, categories, fund assignment |
| `cash-count/`, `audit/`, `reports/` | their pages' interactive parts, charts |
| `layout/` | shell, sidebar, bottom tab bar, user menu, page header, print button |
| `pwa/` | service-worker registration, install prompt |

## 7. Page patterns

- **Login**: split screen on desktop (dark brand panel with soft blurred circle,
  hero line "Every peso accounted for.", three highlights) and a plain centred
  form on phones. Two steps: email, then the 6-digit code.
- **Dashboard**: welcome header with role badge → `BalanceCard` per fund (the
  equation *cash on hand + released vouchers = fund amount*, progress bar,
  Healthy/Low badge) → two-column cards of "what is waiting for you" and the
  month's spend. Role decides which cards show.
- **Lists** (vouchers, replenishments, audit, reports): `PageHeader` with
  actions (CSV export, New voucher, Scan paper voucher) → filter form
  (`<form method="get">` with search, status, dates) → `ResponsiveList`.
  Filters live in the URL, so they survive refresh and can be shared.
- **Voucher form**: sections are Fund and date → payee → **lines** (each line a
  bordered block: particulars, amount, category, remove) → running total and
  limits hint → proof of spending. At the top, an optional dashed
  **Scan paper voucher** card (primary tint). Buttons are bottom-right:
  *Save draft* (outline) and the primary action, which changes meaning with the
  amount ("Save and release cash" or "Submit for approval").
- **Voucher detail**: two columns on desktop. Left: summary card (status badge,
  details grid, lines list), receipt card, optional paper-voucher card. Right:
  an **Actions** card (only the buttons the viewer may use now, with a one-line
  explanation of the current state) and a Timeline/History tabs card.
- **Approvals**: queue sorted so vouchers that block cash come first.
  Desktop master–detail; phone cards that open a sheet.
- **Print** (`voucher-print`): follows the paper Petty Cash Voucher: title, date,
  "To:", particulars/amount table with blank rows, amount in words, two
  signature lines.
- **Scan/AI affordances**: reading shows the photo with a sweeping line and a
  spinner (`ScanProgress`); results show an amber "check this" note; a cooldown
  counter ("Scan again in 12s") replaces the button label while the service
  rests.

## 8. Where things go (architecture)

### Directory map

```
src/
  app/
    (auth)/login/            sign-in (no app shell)
    (app)/                   everything behind sign-in, wrapped by AppShell
      layout.tsx  loading.tsx  error.tsx
      <route>/page.tsx       server component: auth → data → render
      vouchers/[id]/edit/    nested routes live beside their parent
    api/                     only machine endpoints (cron digest, health)
    layout.tsx  globals.css  manifest.ts
  actions/                   server actions ("use server"), one file per domain
  components/
    ui/                      shadcn primitives (generated, rarely edited)
    shared/                  reusable, feature-agnostic building blocks
    layout/                  app shell pieces
    <feature>/               components that belong to one feature
  lib/                       framework-light logic, no JSX
    validators/              zod schemas (shared by browser and server)
    supabase/                client, server, admin and proxy helpers
    notifications/           email events, layout, digest, delivery
  proxy.ts                   per-request security headers and session refresh
supabase/migrations/         every database change, in order
tests/                       Vitest (unit and database integration)
e2e/                         Playwright (browser)
docs/                        guides (this file, USER_GUIDE, SECURITY, GOOGLE_DRIVE)
scripts/  apps-script/       one-off setup helpers
```

### Decision table: "where does this go?"

| You are adding… | Put it in | Why |
| --- | --- | --- |
| A new screen | `src/app/(app)/<route>/page.tsx` | Routes are folders; auth and shell come from the layout |
| A page's data loading and mapping | The `page.tsx` (server component) | Keeps secrets and queries on the server; pass plain props down |
| Something interactive on that page (state, dialogs, forms) | `src/components/<feature>/<name>.tsx` with `"use client"` | Interactivity needs a client component; keep the page itself server-side |
| A button/dialog/list used by two or more features | `src/components/shared/` | One implementation, one look |
| A raw design primitive | `src/components/ui/` via shadcn CLI | Matches `components.json` |
| A write to the database | A function in `src/actions/<domain>.ts` | Validates, checks the user, calls an RPC, revalidates |
| A rule about *who may do what* | `src/lib/permissions.ts` **and** the database function | The screen hides buttons, the database enforces |
| Validation of input | `src/lib/validators/<domain>.ts` (built from `text.ts`) | Same schema runs in the browser and on the server |
| A pure helper (money, dates, status labels) | `src/lib/<name>.ts` | No React, easy to unit-test |
| A status or label set | `src/lib/<thing>-status.ts` + a badge in `shared/` | Labels and colours stay in one place |
| An email or alert | `src/lib/notifications/events.ts` (+ `deliver.ts` event type) | Queued after the response, never blocks the action |
| A table, column, policy or function | A **new** file in `supabase/migrations/` | Never edit an applied migration; then regenerate `database.types.ts` |
| A nav item | `src/lib/navigation.ts` (+ route rule in `permissions.ts`) | Menus are built from data per role |
| A setting or secret | `.env.example` (documented) + `wrangler secret put` | Never in code or the repo |
| Types shared by a page and its components | `src/components/<feature>/types.ts` | Keeps page → component props explicit |
| A test | `tests/` for logic and database rules, `e2e/` for browser flows | See section 9 |

### Boundaries to respect

- **Server vs client.** Pages are server components. Add `"use client"` only to
  files that need state, effects, or browser APIs. Never import server-only
  modules (`lib/supabase/server`, `lib/supabase/admin`, actions' internals) into
  client components; call **actions** instead.
- **Secrets stay server-side.** Only `NEXT_PUBLIC_*` values reach the browser.
  The service-role key is used only in `lib/supabase/admin.ts`.
- **The database is the authority.** UI checks (`canPerform`) are for hiding
  buttons. Real enforcement is Row Level Security and the RPC functions.
- **Money as numbers in centavos** inside logic (`parseMoney`), `string` in
  forms, `MoneyText` on screen.
- **Dates** use the app time zone helpers in `lib/dates.ts`, not `new Date()`
  formatting inline.
- **Import alias:** `@/` points to `src/`. Use it instead of long relative paths.

## 9. How to build a new feature

1. **Model it.** New table or column? Write a migration in `supabase/migrations/`
   (timestamp-prefixed, RLS on, grants explicit, length checks on text), apply it
   to the dev project, regenerate `src/lib/database.types.ts`.
2. **Validate it.** Add a zod schema in `src/lib/validators/`, using `text()`,
   `labelText()`, `personName()` from `text.ts` for strings.
3. **Write the action.** In `src/actions/<domain>.ts`: get the user, parse input,
   rate-limit if it can be spammed, call the RPC through the user's Supabase
   client, map errors with `safeDbMessage`, `revalidatePath`, queue any email with
   `queueNotification`. Return `ActionResult` (`{ ok: true } | { ok: false, error }`).
4. **Build the page.** Server component: `requireUser(path)` → fetch → map rows
   to plain props → render `PageHeader` + components. Add the route to
   `permissions.ts` and (if it is a menu item) `navigation.ts`.
5. **Build the client part.** Reuse `shared/` blocks. Use `ResponsiveList` for
   lists and `ResponsiveDialog` for modals so phone and desktop both work.
6. **Check responsiveness** at 390 px and 1280 px. Add the path to `PAGES` in
   `e2e/layout.spec.ts` if it is a new top-level page.
7. **Test it.** Pure logic → `tests/*.test.ts`. A database rule → a Vitest
   integration test (runs with `RUN_DB_TESTS=true`, one file at a time). A user
   flow → a Playwright spec (`E2E_AUTHENTICATED=true`).
8. **Document it.** Update `docs/USER_GUIDE.md` for people-facing changes and
   `docs/SECURITY.md` if you touched auth, limits or headers.
9. **Run** `pnpm lint`, `pnpm typecheck`, `pnpm test`. Nothing ships if these fail.

### Using the shared components (short recipes)

```tsx
// A list that is a table on desktop and cards on phones
<ResponsiveList
  rows={rows}
  getRowKey={(r) => r.id}
  columns={[
    { key: "date", header: "Date", cell: (r) => formatDate(r.date) },
    { key: "amount", header: "Amount", headerClassName: "text-right",
      className: "text-right", cell: (r) => <MoneyText value={r.amount} /> },
  ]}
  renderCard={(r) => <Card>…</Card>}
  empty={<EmptyState icon={ReceiptText} title="Nothing here" description="…" />}
/>

// A modal that is a bottom sheet on phones
<ResponsiveDialog open={open} onOpenChange={setOpen} title="Edit fund" description="…">
  …form…
  <DialogFooter>…</DialogFooter>
</ResponsiveDialog>

// A link that looks like a button
<Button nativeButton={false} render={<Link href="/vouchers/new" />}>
  <ReceiptText /> New voucher
</Button>

// A status
<StatusBadge status={voucher.status} />
```

## 10. Forms, validation and errors

- **Form shape.** `react-hook-form` with `zodResolver(schema)`. Label above each
  field, error text under it, `aria-invalid` on the field. Use `Controller` for
  `Select` and other non-native inputs.
- **Field limits.** Every input has `maxLength` matching the schema; the server
  and the database enforce the same limits.
- **Text is cleaned.** The `text()` helper strips control and invisible characters
  and `<` `>`; names and labels allow only sensible characters.
- **Submit buttons** disable while working and change their label
  ("Saving...", "Releasing...").
- **Feedback.** Success → `toast.success` and navigate or refresh. Errors from
  the server → an `Alert variant="destructive"` in the form (`serverError`), field
  errors inline. Never show raw database messages (`safeDbMessage`).
- **Irreversible actions** → `ConfirmDialog` or `ReasonDialog` with a sentence
  that states the consequence.
- **Cooldowns and limits** are visible to the user (countdown on buttons) rather
  than failing silently.

## 11. Accessibility, motion and print

- **Focus.** Every interactive element shows a 3 px ring (`focus-visible`); do not
  remove outlines.
- **Semantics.** Navigation landmarks have labels (`aria-label="Primary"`); the
  current item uses `aria-current="page"`; icon-only buttons have `aria-label`;
  live status (scan reading) uses `role="status"`.
- **Colour is never the only signal.** Statuses have text labels; errors have
  text; the low-balance state has a badge word.
- **Touch targets.** Bottom-bar items and cards are large. Default buttons are
  32 px high (see known gaps).
- **Reduced motion.** The scan sweep stops under `prefers-reduced-motion`.
- **Print.** `@media print` sets A4 with 12 mm margins and a white background and
  keeps colours. Use `print:hidden` on chrome (sidebar, bars, toasts, buttons) and
  `hidden print:block` for the printable voucher. The shell removes max width and
  padding when printing.

## 12. PWA and branding

- **Name:** "Petty Cash Fund" (short "Petty Cash"). Logo is a `Wallet` icon in a
  rounded dark tile; tagline "Fund ledger".
- **Theme colour** `#171717`, background `#ffffff`, `display: standalone`, start
  URL `/dashboard`. Icons 192/512 plus a maskable 512 in `public/icons/`.
- **Offline.** The service worker (`public/sw.js`) caches only the shell and
  static assets and shows `offline.html` when offline; it never caches private
  data. Bump `CACHE_VERSION` when precached files change.
- **Install prompt** is captured in `components/pwa/` and surfaced from the user
  menu.

## 13. Rules of thumb and known gaps

**Do**

- Reuse a `shared/` component before writing a new one; add to `shared/` when a
  second feature needs the same thing.
- Keep pages server-rendered and push interactivity into small client components.
- Use tokens (`bg-muted`, `text-muted-foreground`), `MoneyText` for every amount
  and `StatusBadge` for every status.
- Test at 390 px and 1280 px before calling a screen done.

**Don't**

- Don't hard-code hex colours (status badges are the only exception).
- Don't switch layouts at `md` for phone-versus-desktop decisions; use `lg`.
- Don't put business rules only in the UI; add them to the database function.
- Don't edit an applied migration or the generated `database.types.ts` by hand.
- Don't put secrets, tokens or backups in the repository.

**Known gaps (honest list)**

- Dark mode tokens exist but no toggle or provider is wired.
- Default buttons and inputs are 32 px tall, below the 44 px touch guideline; large
  actions on phones rely on `size="lg"` or card-sized tap areas. Consider a
  taller `h-10` default on `max-sm`.
- Charts use a single colour (`primary`); the `chart-*` tokens are unused.
- The `ui/` folder follows shadcn defaults and has a few unused variants.
