# Design guide

How this app (MAD Receipts: receipts, deals and car documents) looks, how it adapts to screens, and where new code belongs.
Read this before adding a page or component so it matches what is already here.

Contents

1. [Design principles](#1-design-principles)
2. [Stack and libraries](#2-stack-and-libraries)
3. [Design tokens](#3-design-tokens)
4. [Layout and the app shell](#4-layout-and-the-app-shell)
5. [Responsive behaviour](#5-responsive-behaviour)
6. [Components](#6-components)
7. [Where things go](#7-where-things-go)
8. [Building a new feature](#8-building-a-new-feature)
9. [Forms, errors and accessibility](#9-forms-errors-and-accessibility)
10. [PWA and branding](#10-pwa-and-branding)
11. [Rules of thumb](#11-rules-of-thumb)

---

## 1. Design principles

- **Calm and neutral.** A black-and-white ledger look (neutral greys, one dark primary). Colour is rare and always means something: status, warning, error.
- **Money is the hero.** Amounts use tabular numbers, are right-aligned in tables and are never truncated.
- **Phone first for people in the field.** Sales and Documentation work from a phone: big cards, a bottom tab bar, bottom sheets, camera-friendly uploads. Desks get a sidebar and tables.
- **One screen, one job.** A page has a title, one short description and a small set of actions in the header. Everything else is cards.
- **Say what to do next.** A car page, a receipt or a deal always tells the person the next step in plain words, and a button that is disabled says why.
- **The database enforces the rules.** The screen hides buttons a role may not use, but money rules and permissions are checked again on the server and in the database.

## 2. Stack and libraries

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 App Router, React 19, TypeScript. Server components by default; pages that read the signed-in user do it inside `Suspense`. |
| Styling | Tailwind CSS v4 (tokens in `src/app/globals.css`, no `tailwind.config`). |
| Components | shadcn/ui, style **base-nova**, built on **Base UI** (`@base-ui/react`) primitives. |
| Icons | `lucide-react` (`size-4` inline, `size-5` in tiles/nav). |
| Forms | `react-hook-form` + `zod` via `@hookform/resolvers`, or a plain form with a server action for small ones. |
| Toasts | `sonner`. |
| Theme | `next-themes` (light and dark, one tap in the user menu). |
| Database | Supabase (Postgres, Row Level Security, storage); the server uses the service-role client only after checking the user. |
| Fonts | Geist Sans and Geist Mono through `next/font` (self-hosted). |
| Class helper | `cn()` from `src/lib/utils.ts` (clsx + tailwind-merge). |

Base UI note: a "render as a link" button is written `<Button nativeButton={false} render={<Link href="..." />}>`. It then exposes `role="button"`, which matters for tests.

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
  items with each person's modules (`src/lib/navigation.ts`).
- **Content width**: `max-w-6xl` centred. Print removes the cap and padding.

Every page starts with the same header:

```tsx
<div className="space-y-6">
  <PageHeader title="Deals" description="…" actions={<Button>…</Button>} />
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
| Two-pane detail (`documents/[plate]`, `deals/[id]`) | One column | `lg:grid-cols-[minmax(0,1fr)_24rem]`: content left, actions on the right |
| Navigation | Top bar + bottom tab bar | Fixed sidebar |
| Login (`(auth)/login`) | Form only | `lg:grid-cols-2`: brand panel on the left, form on the right |
| Detail lists (`<dl>`) | 1 column | `sm:grid-cols-2` |
| Dashboard cards | 1 column | `md:grid-cols-2` |

### Rules every page must follow

1. **No horizontal page scroll** at 390 px or 1280 px. This is tested:
   `e2e/responsive.spec.ts` opens every page at both sizes (Playwright projects
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


## 6. Components

**Primitives** (`src/components/ui/`, shadcn, do not restyle ad hoc): `Button` (variants default, outline, secondary, ghost, destructive, link), `Input`, `NativeSelect`, `Label`, `Card`, `Badge`, `Dialog`, `Table`, `Skeleton`, `Sonner`. Add new ones with the shadcn CLI so they match `components.json`.

**Shared blocks** (`src/components/shared/`, use these first):

| Component | Use it for |
| --- | --- |
| `PageHeader` (in `layout/`) | Title, description and header actions of every page |
| `ResponsiveList` | A list that is a table on desktop and cards on phones |
| `ResponsiveDialog` | A form or detail in a modal (bottom sheet on phones) |
| `AskDialog` | "Are you sure?" and questions that need a typed answer |
| `EmptyState` | A dashed card with icon, title and one helpful sentence |
| `FormField` | Label above, error under |
| `PageSkeleton` | The `Suspense` / `loading.tsx` placeholder |
| `Pill` and the status badges (`status-badge.tsx`) | Status pills with fixed colours: deals, receipts, sync jobs, and the car documents stages |

**Status colours.** Soft pill: light tint background, dark text, no border, with `dark:` variants. The meaning is the same everywhere: amber = needs attention or waiting, emerald/teal = done or complete, red = error or flagged, blue/sky = in progress or being read, zinc/grey = neutral or none. Colour is never the only signal: every status has a word.

**Feature components** live beside their page (for example `src/app/(app)/documents/[plate]/`) and in `src/components/receipt/` (the printable receipt and transmittal paper) and `src/components/deal/`.

## 7. Where things go

```
src/
  app/
    (auth)/login/          sign-in (no app shell)
    (app)/<route>/         every page behind sign-in, wrapped by AppShell
      page.tsx             server component: user, data, render
      actions.ts           server actions for that page ("use server")
    api/                   machine endpoints only (cron, scanner callback, uploads, health)
    print/                 print views
  components/              ui, shared, layout, receipt, deal, pwa, theme
  lib/                     logic with no JSX: deals, docs, docsbible, grokbot, google, sync, voice, golive ...
  proxy.ts                 per-request security headers and session refresh
supabase/migrations/       every database change, in order
tests/                     Vitest (unit; hosted-database tests with ALLOW_HOSTED_TESTS)
e2e/                       Playwright (browser)
Docs/                      guides (this file, TEST_FLOW, WORKFLOWS, GO_LIVE ...)
scripts/  apps-script/     one-off helpers and the Google Apps Script bridge
```

| What | Where |
| --- | --- |
| A write to the database | A server action in the page's `actions.ts`, or a function in `src/lib/<area>/`: check the user and module first, validate input, revalidate |
| Who may see or do what | Modules per role in `src/lib/navigation.ts`, checked with `requireModule`; the database enforces the money rules |
| A table, column, policy or function | A **new** file in `supabase/migrations/`; never edit an applied one |
| A message to people | Telegram, through `src/lib/telegram.ts` |
| A nav item | `src/lib/navigation.ts` |

## 8. Building a new feature

1. **Model it.** New table or column: write a migration (timestamp-prefixed, RLS on, grants explicit, length checks on text) and apply it to the hosted project.
2. **Write the action.** Get the user with `requireModule`, parse the input with zod, do the work, return `{ ok, message }`, and `revalidatePath`.
3. **Build the page.** Server component: user, data, plain props, `PageHeader`, components. Add the nav item in `navigation.ts` if it is a menu item.
4. **Build the client part.** Reuse `shared/` blocks; `ResponsiveList` for lists and `ResponsiveDialog` for modals.
5. **Check responsiveness** at 390 px and 1280 px (`e2e/responsive.spec.ts` opens the pages at both).
6. **Test it.** Logic in `tests/*.test.ts`; a user flow in a Playwright spec on the hosted test project.
7. **Document it.** Update `Docs/TEST_FLOW.md` and `Docs/WORKFLOWS.md` when a workflow changes.
8. **Run** lint, `tsc`, unit tests and the browser tests before pushing.

## 9. Forms, errors and accessibility

- Label above each field, error text under it, `aria-invalid` on the field, and a `maxLength` that matches the schema.
- Submit buttons disable while working and change their label ("Saving…").
- Success is a toast; errors are shown in words next to what failed. Never show raw database messages.
- Irreversible actions use a confirmation that states the consequence.
- Every interactive element shows a focus ring; icon-only buttons have `aria-label`; live status uses `role="status"`.
- Colour is never the only signal. Touch targets on phones are card-sized or `size="lg"`.
- Printing: `@media print` sets A4, `print:hidden` on chrome, `hidden print:block` for the printable paper.

## 10. PWA and branding

- **Name:** "MAD Receipts" (short "Receipts"), start URL `/`, theme colour `#171717`, `display: standalone` (`src/app/manifest.ts`).
- The service worker caches only the shell and static assets and never caches private data. The install button is in the user menu.

## 11. Rules of thumb

**Do**
- Reuse a `shared/` component before writing a new one.
- Keep pages server-rendered and push interactivity into small client components.
- Use tokens (`bg-muted`, `text-muted-foreground`) and the status pills for every status.
- Test at 390 px and 1280 px before calling a screen done.

**Don't**
- Don't hard-code hex colours (status pills are the only exception).
- Don't switch layouts at `md` for phone versus desktop; use `lg`.
- Don't put business rules only in the UI.
- Don't edit an applied migration.
- Don't put secrets, tokens or backups in the repository.
