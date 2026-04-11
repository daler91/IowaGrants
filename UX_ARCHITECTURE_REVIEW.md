# UX Architecture Review — IowaGrants

## Context
IowaGrants is a Next.js 14 (App Router) app that aggregates small-business grants from federal, state, local, private, and article/PDF sources so Iowa entrepreneurs can discover them. The backend (scrapers, AI, DB) is mature; the user-facing surface has never had a holistic UX pass. The owner asked for a "full UX architecture review" from me (as UX architect for the project).

This document is that review. It is the **deliverable**, not a plan to write one later. Findings are prioritized P0–P3 with concrete file/line references so any item can be picked up and implemented directly. A phased roadmap and verification approach appear at the end.

**Scope reviewed**
- Public pages: `src/app/layout.tsx`, `page.tsx`, `grants/[id]/page.tsx`, `calendar/page.tsx`, `export/page.tsx`, `login/page.tsx`, `register/page.tsx`, `error.tsx`, `globals.css`
- Components: `NavBar`, `SearchBar`, `GrantFilters`, `GrantList`, `GrantCard`, `DeadlineCalendar`, `ConfirmModal`, `AdminEditButton`
- Admin: `admin/layout.tsx`, `admin/page.tsx`, `admin/invites/page.tsx`, `admin/blacklist/page.tsx`, `admin/grants/[id]/edit/page.tsx`
- Data contracts: `prisma/schema.prisma`, `src/lib/types.ts`, `src/lib/grant-query.ts`, `src/app/api/grants/*`, `src/middleware.ts`

**Executive summary**
The app is well-structured at the code level: URL-driven filter state, server pagination, skeleton loaders, semantic HTML on most surfaces, `ConfirmModal`, `Suspense` fallbacks, proper `<dialog>` and ARIA on several primitives. But viewed as a product, three structural problems hold it back:

1. **Discovery is weaker than the data model allows.** Sort, amount, location, and industry filters exist on the API but are missing from the UI. Search only matches title + description. The default status filter silently hides CLOSED grants without telling the user.
2. **Mobile is a second-class experience.** NavBar has no hamburger, filter sidebar dumps the full filter stack above the list on phones, and no touch-drawer pattern exists.
3. **There is no design system.** CSS variables in `globals.css` define a palette, but 40+ sites hardcode `red-600`, `blue-500`, `pink-100`, `indigo-100`, etc. There is no dark-mode support at all, no shared button/alert/toast/tag components, and typography scale drifts across pages.

The rest of the issues (a11y gaps, empty-state copy, unsaved-changes warnings, etc.) are real but less structural.

---

## Priority legend
- **P0 — Critical**: Breaks or badly degrades the product for common users. Fix first.
- **P1 — High**: Significant friction or missing capability most users need.
- **P2 — Medium**: Quality-of-life, polish, consistency.
- **P3 — Low**: Nice-to-haves and future roadmap seeds.

---

## P0 — Critical

### P0-1. NavBar has no mobile layout
**Where:** `src/components/NavBar.tsx:31-86`
**What:** A single horizontal `flex gap-6 items-center` contains a `text-2xl font-bold` wordmark plus Dashboard / Deadlines / Export / (Admin) / (Logout|Login) — up to 6 items at every viewport. There is no hamburger, no drawer, no `md:hidden`/`md:flex` branching. At ~375px the items either wrap awkwardly below the wordmark or push off-screen.
**Why it matters:** Small business owners on mobile are a primary audience.
**Fix:** Introduce a mobile breakpoint: `md:flex` for the desktop row, and a hamburger button (`md:hidden`) that opens a slide-over sheet. Keep the sticky header height stable so page content below isn't displaced.

### P0-2. Default status filter silently hides CLOSED grants
**Where:** `src/app/page.tsx:32` — `status: parseList(...) || (["OPEN", "FORECASTED"] as ...)`
**What:** If the URL has no `status` param, the dashboard secretly sets status to `OPEN + FORECASTED`. The `GrantFilters` status MultiSelect renders placeholder "All" (`src/components/GrantFilters.tsx:33-37, 210`) because its `values={filters.status ?? []}` sees the default as "none selected" in the UI, but the fetch DOES send the default. User sees "All" in the filter, but CLOSED grants are hidden.
**Why it matters:** This is a silent data-hiding bug. Discovery tools must not lie about what's being shown.
**Fix:** Either (a) make the default explicit — pre-check OPEN and FORECASTED in the MultiSelect so the label reads "Open, Forecasted" — or (b) drop the default and show a first-run banner explaining that closed grants are hidden until you tick the filter. Option (a) is lower-risk.
**Context:** Commit `5796e50 Default status filter to Open and Forecasted grants` introduced the default on purpose. The product intent is correct; the UI just doesn't mirror the intent. Frame the fix as "make the existing default visible," not "undo the default."

### P0-3. Urgency is communicated by color alone
**Where:** `src/components/GrantCard.tsx:107`, `src/app/grants/[id]/page.tsx:99-105`, `src/components/DeadlineCalendar.tsx:31`
**What:** "Urgent deadline" is conveyed with `text-red-600` / `bg-red-50` and nothing else. No icon, no text affix, no pattern. Fails WCAG 1.4.1 (Use of Color).
**Fix:** Add a non-color signal: an "⚠ Due in N days" label next to the date, a clock icon, or a "Closing soon" badge pill. Keep the color, but pair it with text or iconography.

### P0-4. Calendar is not keyboard-navigable beyond Tab
**Where:** `src/components/DeadlineCalendar.tsx:162-227`
**What:** Each day is a separate `<button>` with good `aria-label` + `aria-pressed`, but the grid has no `role="grid"` and no roving tabindex / arrow-key navigation. Keyboard users must tab through 28–31 cells to reach the end of a month, with no Home/End/PgUp/PgDn.
**Fix:** Wrap in `role="grid"` with `role="row"` / `role="gridcell"`, implement arrow-key navigation with a roving `tabIndex`, and handle PgUp/PgDn to change months. Pattern: W3C ARIA Authoring Practices "Date Picker Dialog".

### P0-5. No dark mode; no system-color-scheme support
**Where:** `src/app/globals.css:5-15`
**What:** Only a light palette is defined. There is no `@media (prefers-color-scheme: dark)` branch and no `.dark` class variant. On devices set to dark mode, the app renders as a bright white card grid against a user's dark OS chrome — visually jarring and a known pain point for long sessions.
**Fix:** Add a `prefers-color-scheme: dark` block in `globals.css` that remaps the CSS variables, and audit the 40+ hardcoded Tailwind color sites (see cross-cutting section) so they don't bypass the tokens. Manual toggle in NavBar is optional; auto via OS is the minimum.


## P1 — High

### P1-1. No sort control
**Where:** `src/app/api/grants/route.ts:21` — orderBy is hardcoded `[{ deadline: asc }, { createdAt: desc }]`. No `sort` param is accepted.
**What:** Users cannot sort by amount, title, date added, or source. For a discovery tool this is a big gap — "biggest grants first" is a common user intent.
**Fix:** Accept `sort=deadline|amount|recent|title` and `dir=asc|desc` on the API, add a sort dropdown in `GrantList` header (next to "Showing X of Y"), and include it in `buildGrantQueryParams` so it round-trips through the URL.

### P1-2. Amount, location, and industry filters missing from the UI
**Where:** `src/components/GrantFilters.tsx` (only renders Business Stage, Grant Type, Demographics, Use of Funds, Status). Compare to `src/lib/grant-query.ts:79-115` which accepts `location`, `industry`, `amountMin`, `amountMax`.
**What:** Three high-value filters exist on the API but have no UI surface. A user cannot ask "show me grants of $10k+ for tech businesses in Des Moines" even though the data supports it.
**Fix:**
- Add an **Amount** range control (two numeric inputs or a slider with presets: "Any / $1k+ / $10k+ / $50k+ / $100k+").
- Add a **Location** combobox sourced from `SELECT DISTINCT unnest(locations) FROM "Grant"` (cache the list server-side).
- Add an **Industry** combobox the same way.
- Note for Amount: the API inverts the logic (`amountMin=50000` → matches grants whose `amountMax >= 50000`, see `grant-query.ts:109-115`). The UI label should read "Maximum award of at least $X" to avoid confusion.

### P1-3. No active-filter chips above the results
**Where:** `src/app/page.tsx:244-265` — filters live in the sidebar and never echo above the list.
**What:** Once a user sets 3 filters they scroll into the grid and forget what's applied. Standard e-commerce/discovery pattern is a chip row like: `[Federal ×] [Women-Owned ×] [Des Moines ×] [Clear all]`.
**Fix:** Add an `ActiveFilterChips` component that reads `filters + search`, renders a chip per active value with remove (×), plus a "Clear all" at the end. Sits between the `SearchBar` and the result grid. On mobile this replaces the collapsed filter sheet's entry point.

### P1-4. Mobile filter UX dumps the whole sidebar above the list
**Where:** `src/app/page.tsx:244` — `flex flex-col lg:flex-row gap-6` with `aside w-full lg:w-64`
**What:** On phones, all filter dropdowns render full-width above the results. Users scroll through every filter to reach a single grant.
**Fix:** On `<lg` viewports replace the sidebar with a sticky "Filters (3)" button that opens a bottom sheet / slide-over drawer. Reuse `GrantFilters` as the drawer body. Show active-filter count on the button.

### P1-5. Search scope is invisible and narrow
**Where:** `src/lib/grant-query.ts:86-91` — only `title` and `description` are searched. `src/components/SearchBar.tsx:27` — placeholder doesn't say what's searched.
**What:** Users will search "SBA" or "Des Moines" or "equipment" and get confused when those filters work but search doesn't.
**Fix (short term):** Placeholder → `"Search titles and descriptions…"` and add helper text under the input: `"Searching titles + descriptions. Use filters for source, location, or type."`
**Fix (medium term):** Extend `where.OR` to include `sourceName` and `eligibility`. A full Postgres tsvector is out of scope for this review but worth noting in the backlog.

### P1-6. "Rolling / no deadline" is not a first-class state
**Where:** `src/lib/deadline.ts` (inferred via `formatDeadlineShort`) and `GrantCard.tsx:104-111`
**What:** Grants with `deadline = null` are valid ("rolling" / always open) but sort to the bottom (`nulls: "last"`) and render as "No deadline" text in gray. They look like missing data, not like "always open." Users miss the best grants (those they can apply to anytime).
**Fix:** Render rolling grants with a distinct pill (e.g., green "Rolling" badge) and allow a sort preset "Rolling first." Update `isDeadlineUrgent` not to flag them.

### P1-7. Broken pagination after bulk delete
**Where:** `src/app/page.tsx:171-182`
**What:** After delete, the code refetches `/api/grants?page=1&limit=20` with **no filter params** to compute whether the current page overflowed. The totalPages it gets back is for the whole DB, not the currently filtered set. If the filtered set shrank, you can be stranded on a page past the end. Confusing "no grants found" despite there being data with no filter.
**Fix:** Reuse `buildGrantQueryParams(filters, search)` for the overflow probe, matching the filters that are active.

### P1-8. Silent selection loss on page change
**Where:** `src/app/page.tsx:130-132`
**What:** When admin switches pages mid-selection, selectedIds is cleared with no warning. Admins who spent 30 seconds ticking boxes lose their work.
**Fix:** Either persist selection across pages (Set of ids is already in state — just don't clear it) or warn before page change when selection is non-empty. Persistence is better; the Delete button already shows a count.

### P1-9. No toast / centralized feedback system
**Where:** Spread across `src/app/admin/invites/page.tsx`, `admin/blacklist/page.tsx`, `admin/grants/[id]/edit/page.tsx`, `export/page.tsx`
**What:** Every page reinvents feedback:
- Edit page uses a green banner that persists.
- Invites page has transient clipboard state that doesn't confirm.
- Blacklist page refreshes silently on add.
- Export "Copy share link" flips button label for 2s but has no ARIA announcement.
- No consistent destructive/success/info pattern.
**Fix:** Add a `Toaster` primitive (headless or from `sonner`/`react-hot-toast`) with `aria-live="polite"` region. Standardize: `toast.success("Invite copied")`, `toast.error("Failed to save")`. Remove ad-hoc banners except for validation errors next to inputs.


## P2 — Medium

### P2-1. "Clear All Filters" is a faint text link; no active-count badge
**Where:** `src/components/GrantFilters.tsx:213-218`
**What:** Styled as `text-sm text-[var(--primary)] hover:text-[var(--primary-light)]` — looks like a hint, not a control. No indication of how many filters are active.
**Fix:** When any filter is non-empty, show a heading `"Filters (3 active)"` and style the button as a subtle outlined button so it looks clickable. Addressed implicitly by P1-3 if active-filter chips are added.

### P2-2. CLOSED computation uses client-local time
**Where:** `src/components/GrantCard.tsx:23-24`, `src/app/grants/[id]/page.tsx:42-43`
**What:** `isDeadlinePassed(grant.deadline)` compares against `new Date()` on the client, while the API uses server UTC. On deadline day a user in one timezone sees "OPEN" and another sees "CLOSED."
**Fix:** Either (a) trust the server's computed `displayStatus` (add a field to the API response), or (b) normalize to the grant's deadline-end-of-day in the source timezone. Option (a) is simpler and consistent.

### P2-3. Calendar: "selected" visual erases "urgent" and "today"
**Where:** `src/components/DeadlineCalendar.tsx:29-35`
**What:** `getCellBorderClass` picks one state — selected > urgent > today > hasGrants. A cell that's today AND urgent AND selected shows only the selected blue ring; the user loses context.
**Fix:** Compose: selected should be a ring, urgent should be the background, today should be the date-number weight. They shouldn't be mutually exclusive classes.

### P2-4. Admin edit form: no unsaved-changes warning
**Where:** `src/app/admin/grants/[id]/edit/page.tsx:511-516` (Cancel link), no `beforeunload` listener
**What:** A 15-field form lets users navigate away freely. One misclick = lost work.
**Fix:** Track a `dirty` flag (compare current `form` to the initial snapshot). On Cancel click with dirty=true, show a ConfirmModal. Add a `beforeunload` listener gated on dirty.

### P2-5. Admin edit: array fields are raw comma-separated strings
**Where:** `src/app/admin/grants/[id]/edit/page.tsx:418-449`
**What:** `locations` and `industries` are `String[]` in Postgres, but the UI is a plain `<input type="text">` with comma hint. No autocomplete from existing values. No validation that "Iowa" is canonical vs "IA". This is the data entry surface for a human-curated field — it should help the human.
**Fix:** Replace with a tag-input component fed by a `/api/meta/locations` and `/api/meta/industries` endpoint (`SELECT DISTINCT unnest(...)`). Free-text still allowed but suggestions appear as you type.

### P2-6. Grant detail has no "related grants" section
**Where:** `src/app/grants/[id]/page.tsx:185-232`
**What:** Page ends with outbound links (Source, PDF, Found via). Dead-ends the browsing session.
**Fix:** Add a "Similar grants" rail below the action buttons: same `grantType` + overlapping `eligibleExpenses` or `categories`, exclude current id, limit 3. Pure additive feature, no data model change.

### P2-7. Login is a dead-end for non-admins
**Where:** `src/app/login/page.tsx`
**What:** A visitor who finds the login page has no path forward — no "Request access" link, no explanation that the app is invite-only, no marketing copy.
**Fix:** Add a subtitle: "Admin access only. Contact the site owner to request an invite." Consider a mailto link or a contact form.

### P2-8. Empty-state copy is generic
**Where:** `src/components/GrantList.tsx:81-105`
**What:** "No grants found / Try adjusting your search or filters." is passive. When filters are applied it should offer an action.
**Fix:** When `hasActiveFilters` → render a "Clear all filters" button inside the empty state card. When no filters → render a "Check back later — grants are updated daily" plus a link to the calendar.

### P2-9. Tab order is visually backwards on the dashboard
**Where:** `src/app/page.tsx:198-229` — the heading + Export button are in a flex row, with Export floated right. After the skip-link hits `#main-content`, first tab focus is the heading's child (nothing interactive), then the Export button, then the SearchBar.
**What:** Keyboard users expect the primary input (search) to be first.
**Fix:** Move the Export button either into the GrantList header bar (near pagination) or after the search bar in DOM order. Visual position can be preserved via flex-order or CSS grid.

### P2-10. AdminEditButton is invisible
**Where:** `src/components/AdminEditButton.tsx`
**What:** Renders as a plain underline-less link with no icon or bordered look. Admins glance at the grant detail and miss it.
**Fix:** Style as a small outlined button with a pencil icon: `[✎ Edit]`. Show only when `isAuthenticated`.

### P2-11. Debounced filter changes have no loading nudge
**Where:** `src/app/page.tsx:124-127`
**What:** A 300ms debounce means clicks feel dead for a third of a second before skeleton kicks in.
**Fix:** Show a subtle top-of-list progress bar (NProgress style) or dim the result grid immediately on filter change, independent of the debounce timer.


## P3 — Low / Roadmap seeds

### P3-1. `error.tsx` is generic and untracked
**Where:** `src/app/error.tsx`
**What:** `console.error` only, generic "Something went wrong," retry button re-mounts the same failing tree.
**Fix:** Wire Sentry (tech-debt item from `TECHNICAL_DEBT.md` §4), show the error digest for support, add "Go home" as a secondary action.

### P3-2. Invite token in URL fragment
**Where:** `src/app/register/page.tsx` (token from `window.location.hash`)
**What:** Already flagged as security in `CODEBASE_AUDIT.md:64`. From a UX angle, `#token=` is fragile in email clients.
**Fix:** Use a path segment: `/register/[token]`. Keeps the token out of Referer headers AND works reliably in every email client.

### P3-3. Typography scale drifts
**Where:** `h1` is `text-3xl` on dashboard/export/edit but `text-2xl` on grant detail (`src/app/grants/[id]/page.tsx:88`). `h2` varies between `text-lg` and `text-xl`.
**Fix:** Publish a scale in `globals.css` or a `typography.ts` utility: `h1 → text-3xl font-bold`, `h2 → text-xl font-semibold`, `h3 → text-lg font-semibold`, body → base.

### P3-4. Saved searches / email alerts (future)
The whole product is about "tell me what grants are available." The natural next step is "tell me when a new one matches." No such capability exists today. Architecture seed: a `SavedSearch` model keyed on filter JSON + email, a daily cron that diffs, a simple unsubscribe link. Not in the scope of this review, but worth holding design space for.

### P3-5. Bookmark / "save for later" for non-admin visitors
**What:** A small-business owner discovers 5 interesting grants on Monday and wants to come back Friday. Today they have to re-filter or bookmark URLs.
**Fix (lightweight):** Store a list of grant ids in localStorage, show a ★ on each card, and add a `/saved` page. No account needed.

### P3-6. Export: no column selection, no CSV/XLSX distinction
**Where:** `src/app/api/grants/export/route.ts` — always returns full Grant objects. `src/lib/export-formatters.ts` decides shape client-side.
**Fix:** Add a "Columns" accordion on the export page so users can drop noisy fields before exporting. Low priority.

### P3-7. Deadline hierarchy on the card
**Where:** `src/components/GrantCard.tsx:96-111`
**What:** The Amount row comes before Deadline. For a time-sensitive discovery tool, deadline is the first thing users make decisions on.
**Fix:** Swap the order, or promote deadline into a colored pill near the top badges row.


## Cross-cutting: design system

The individual findings above keep hitting the same root cause: **there is no design system, just a CSS variable file and a lot of ad-hoc Tailwind.** Fixing the P0/P1 items without addressing this will mean repeating mistakes.

**What exists:**
- `src/app/globals.css:5-15` — 9 CSS variables (`--background`, `--foreground`, `--primary`, `--primary-light`, `--accent`, `--success`, `--muted`, `--border`, `--card`).
- `src/lib/constants.ts` — `TYPE_COLORS`, `STATUS_COLORS` (Tailwind class strings, not semantic tokens).
- `SearchBar` and `ConfirmModal` are clean, reusable primitives. Nothing else is.

**What's missing and recommended:**

1. **Semantic tokens** — extend `globals.css` with:
   - `--danger`, `--danger-bg`, `--warning`, `--warning-bg`, `--info`, `--info-bg`
   - `--badge-women`, `--badge-veteran`, `--badge-minority`, `--badge-startup`, `--badge-existing`
   - Dark-mode remap of all of the above under `@media (prefers-color-scheme: dark)`

2. **Shared components** that replace ad-hoc markup:
   - `<Button variant="primary|secondary|danger|ghost" size="sm|md">`
   - `<Alert variant="success|error|warning|info">` (replaces the 6+ inline red-50/green-50/amber-50 alerts across pages)
   - `<Badge variant="type|status|demographic|stage|rolling|urgent">` (replaces the hardcoded `bg-pink-100 text-pink-800` etc. in `GrantCard` and `grants/[id]/page.tsx`)
   - `<Tag>` for location/industry pills
   - `<FormField label error htmlFor>{children}</FormField>` to eliminate label/input duplication in the edit form
   - `<Toaster>` + `toast()` (P1-9)
   - `<Drawer>` for mobile filters (P1-4) and eventually mobile nav (P0-1)

3. **Hardcoded color audit** — these files bypass the variable system and should be migrated after semantic tokens land:
   - `src/components/GrantCard.tsx:30` (`ring-blue-500 border-blue-300`), `:79-82` (pink), `:84-87` (indigo), `:107` (red), `:118` (gray)
   - `src/components/GrantList.tsx:116` (`text-blue-600`), `:130` (`text-blue-600`), `:137` (`bg-red-600`), `:147` (blue-50 / blue-100)
   - `src/components/DeadlineCalendar.tsx:15-20` (TYPE_DOT_COLORS), `:31-35` (red-50, red-200, blue-50)
   - `src/components/ConfirmModal.tsx:78` (red-600/red-700)
   - `src/app/grants/[id]/page.tsx:76-82, 99, 144` (pink, indigo, red-50, blue-50/blue-200)
   - `src/app/export/page.tsx:281, 303-304` (blue-50, amber-50)
   - `src/app/admin/*/page.tsx` — amber/green/red status pills in `invites/page.tsx`

4. **Type scale** — see P3-3.

5. **Icon system** — inline SVG is used 15+ times with no component wrapper. Adopt `lucide-react` (already Tailwind-friendly) and delete the inline SVG markup. Small bundle cost, large maintenance win.

This is foundational work. It shouldn't ship in isolation — bundle it with the P0 fixes (dark mode needs the token system; mobile nav needs the Drawer; chips/toasts need Button/Alert/Badge).


## Recommended phased roadmap

I recommend shipping this as **four focused PRs**, not one mega-review. Each is independently reviewable and deployable.

### Phase A — Design system foundation (enables everything else)
- Semantic tokens + dark mode CSS (`globals.css`)
- `Button`, `Alert`, `Badge`, `Tag`, `FormField`, `Toaster`, `Drawer` primitives in `src/components/ui/`
- Migrate hardcoded colors in `GrantCard`, `GrantList`, `ConfirmModal`, `DeadlineCalendar` to the new tokens
- No user-visible behavior change — this is a refactor PR

### Phase B — Critical UX fixes (P0 + high-impact P1)
- **P0-1** Mobile NavBar with hamburger + Drawer
- **P0-2** Explicit default status filter (pre-check OPEN + FORECASTED)
- **P0-3** Non-color urgency signal on GrantCard + detail page
- **P0-5** Dark mode wiring (once tokens exist)
- **P1-3** Active filter chips row
- **P1-4** Mobile filter drawer
- **P1-9** Toasts replace ad-hoc banners

### Phase C — Discovery completeness
- **P1-1** Sort dropdown (API + UI)
- **P1-2** Amount / Location / Industry filters (API already supports, UI needed; location/industry need distinct-value endpoints)
- **P1-5** Search scope helper text
- **P1-6** First-class "Rolling" badge + sort preset
- **P1-7** Fix delete-pagination filter bug
- **P1-8** Persist selection across pages

### Phase D — Polish + a11y
- **P0-4** Calendar keyboard navigation (roving tabindex, arrow keys, Home/End, PgUp/PgDn)
- **P2-1..P2-11** Medium-priority items
- Icon migration to `lucide-react`
- Typography scale

P3 items stay in the backlog; saved searches and bookmarks deserve their own design cycle.

---

## Critical files to modify (by phase)

**Phase A (design system):**
- `src/app/globals.css` — tokens + dark mode
- `src/components/ui/*.tsx` — new primitives
- `src/lib/constants.ts` — retire `TYPE_COLORS`/`STATUS_COLORS` Tailwind strings in favor of semantic badge variants

**Phase B (critical UX):**
- `src/components/NavBar.tsx` — mobile drawer
- `src/app/page.tsx` — explicit status default, active-filter chips, mobile filter drawer
- `src/components/GrantCard.tsx` — urgent signal, rolling badge
- `src/app/grants/[id]/page.tsx` — urgent signal

**Phase C (discovery):**
- `src/app/api/grants/route.ts` — accept `sort`/`dir`
- `src/lib/grant-query.ts` — sort param, maybe extend search OR clause
- `src/components/GrantFilters.tsx` — new Amount/Location/Industry controls
- `src/app/api/meta/*` — new distinct-value endpoints for location/industry (cacheable)
- `src/lib/query-params.ts` + `src/app/page.tsx` — URL round-trip for new params
- `src/app/page.tsx:171-182` — fix delete-pagination bug

**Phase D (polish):**
- `src/components/DeadlineCalendar.tsx` — grid roles + keyboard nav
- `src/components/AdminEditButton.tsx` — visible button styling
- `src/app/admin/grants/[id]/edit/page.tsx` — dirty-tracking, confirm on leave, tag inputs
- `src/app/grants/[id]/page.tsx` — related grants rail
- `src/app/login/page.tsx`, `src/components/GrantList.tsx` — copy improvements

---

## Existing utilities to reuse
- `ConfirmModal` (`src/components/ConfirmModal.tsx`) — already generic; use for unsaved-changes warning in P2-4
- `buildGrantQueryParams` (`src/lib/query-params.ts`) — already the canonical URL builder; use it in P1-7 fix
- `requireAdmin` + `UnauthorizedError` (`src/lib/auth.ts`) — standard auth wrapper for new meta endpoints
- `parsePagination` + `parseOptionalInt` (`src/lib/api-utils.ts`) — for sort/amount param parsing
- `VALID_*` constants (`src/lib/constants.ts`) — for option lists; reuse in new filters instead of re-declaring

---

## Verification

Each phase should be verified end-to-end before shipping.

**Automated (every phase):**
- `npm run lint`
- `npm run typecheck` (via `tsc --noEmit`)
- `npm test` — and extend `src/lib/__tests__/grant-query.test.ts` for any new filter logic (sort, amount semantics, search scope)
- `npm run build` — catch Next.js RSC/client boundary issues

**Manual — Phase A (design system):**
- Visual regression: load dashboard, grant detail, calendar, export, admin edit at desktop (1440) and mobile (375). Confirm no layout drift.
- Toggle OS dark mode and confirm all surfaces respect it. Spot-check 10 hardcoded-color sites are now correct.

**Manual — Phase B (critical UX):**
- Mobile (375px DevTools emulation): hamburger opens/closes, Tab order is logical, skip-link works.
- Dashboard with no URL params: Status filter visibly reads "Open, Forecasted" (not "All").
- Filter by `status=CLOSED` via URL: CLOSED grants appear.
- Urgent grant card has ⚠ icon + text, not just red color. Screen reader announces "Closing soon."
- Drawer on mobile opens, filters apply, chip row updates.
- Toast announces "Invite copied" (check aria-live via VoiceOver or axe DevTools).

**Manual — Phase C (discovery):**
- Set amountMin=10000 in UI → results only include grants with amountMax ≥ 10000. Confirm label copy matches.
- Set sort=amount dir=desc → results reorder. URL reflects sort param. Back button restores previous sort.
- Select a Des Moines grant's location from the combobox → filters by location.
- Delete a grant from page 3 of a filtered set where the filter has 41 results → lands on page 3 of 2 (or page 2 of 2) correctly, with filters intact.
- Select grants, paginate, come back → selection preserved.
- Rolling grants appear with distinct badge; "Rolling first" sort groups them at top.

**Manual — Phase D (polish + a11y):**
- Run axe DevTools on /, /grants/[id], /calendar, /export, /admin/grants/[id]/edit — zero critical issues.
- Calendar: tab once to enter grid, arrow keys move through days, Home/End jump to row start/end, PgUp/PgDn change month. Enter selects.
- Edit form: change a field, click Cancel → confirm dialog. Refresh tab → beforeunload prompt.
- Edit form: start typing in locations → suggestions appear.

**Regression watch list across phases:**
- Skip-to-main-content link still focusable first
- URL params still round-trip (filter → URL → reload → same filters)
- Server-side revalidate on grant detail (`revalidate = 300`) still honored
- No new `useEffect` infinite loops (the dashboard already has a subtle dependency chain through `fetchGrants`)
