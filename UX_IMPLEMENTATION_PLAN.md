# UX Implementation Plan

Companion to `UX_ARCHITECTURE_REVIEW.md`. This document converts the prioritized findings into concrete, ordered work items suitable for direct execution. Each item lists the files touched, the approach, and how to verify it.

## Ground rules

- **One PR per phase.** Phases A → B → C → D. Later phases depend on earlier ones.
- **No behavior changes inside refactor steps.** Phase A migrates existing code to new primitives without altering UX. Phase B/C/D introduce real UX changes.
- **Tests first where it's cheap.** Every new API param and every non-trivial utility gets a unit test in `src/lib/__tests__/` before the UI hooks up.
- **Keep the skip-link, URL round-trip, and `revalidate = 300` on grant detail working.** These are the cross-phase regression watch list.
- **Branch:** all work lands on `claude/ux-architecture-review-tUxnk` as separate commits per phase, pushed incrementally.

## Dependency map

```
Phase A (design system)
   │
   ├──▶ Phase B (critical UX)   — needs Button, Alert, Badge, Drawer, Toaster
   ├──▶ Phase C (discovery)     — needs Button, Badge, FormField, tokens
   └──▶ Phase D (polish + a11y) — needs Toaster (unsaved-changes toast),
                                   Button, Badge, FormField
```

Within Phase A, sub-order is strict: tokens → primitives → migration.

---

## Phase A — Design system foundation

**Goal:** Provide the building blocks that every later phase needs. Zero user-visible behavior change — this is a refactor PR.

**Success criteria:**
- Dark mode works via `prefers-color-scheme` across every public and admin page.
- Every hardcoded `red-*`, `blue-*`, `pink-*`, `indigo-*`, `amber-*`, `green-*` Tailwind color in the files listed in the review has been replaced with either a semantic token or a shared primitive.
- `Button`, `Alert`, `Badge`, `Tag`, `FormField`, `Toaster`, `Drawer` exist in `src/components/ui/` with unit tests.
- Visual regression at 1440 and 375 shows no drift from main.

### A.1 Semantic tokens + dark-mode variables
**File:** `src/app/globals.css`
**Approach:**
1. Keep existing `:root` block as the light theme. Add semantic variables:
   - `--danger`, `--danger-bg`, `--danger-border`
   - `--warning`, `--warning-bg`, `--warning-border`
   - `--info`, `--info-bg`, `--info-border`
   - `--success-bg`, `--success-border` (already has `--success`)
   - `--badge-women-bg`, `--badge-women-fg`
   - `--badge-veteran-bg`, `--badge-veteran-fg`
   - `--badge-minority-bg`, `--badge-minority-fg`
   - `--badge-startup-bg`, `--badge-startup-fg`
   - `--badge-existing-bg`, `--badge-existing-fg`
   - `--badge-rolling-bg`, `--badge-rolling-fg`
   - `--badge-urgent-bg`, `--badge-urgent-fg`
   - `--type-federal`, `--type-state`, `--type-local`, `--type-private` (dot colors for the calendar)
2. Add `@media (prefers-color-scheme: dark) { :root { ... } }` that remaps every variable. Use slate-950/slate-900 for backgrounds, slate-100 for foreground, etc. Keep primary blue recognizable.
3. Add a `--focus-ring` token so focus styles are consistent.

**Tests:** Manual only (visual).

### A.2 `<Button>` primitive
**File:** `src/components/ui/Button.tsx` (new)
**Props:** `variant: "primary" | "secondary" | "danger" | "ghost"`, `size: "sm" | "md"`, `loading?: boolean`, plus all native button props via `React.ComponentPropsWithoutRef<"button">`. Also export an `asChild`-style helper or a sibling `<LinkButton>` that renders as `<Link>` for the cases where admin pages use `<Link>` with button styling (e.g., `admin/grants/[id]/edit/page.tsx:511-516`).
**Approach:**
- Primary → `bg-[var(--primary)] text-white hover:bg-[var(--primary-light)]`
- Secondary → outlined on `--border`
- Danger → `bg-[var(--danger)] text-white`
- Ghost → no border, hover fills with `--border`
- Loading state disables and shows a spinner to the left of children.
- `focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]` on all variants.
**Tests:** `src/components/ui/__tests__/Button.test.tsx` — renders each variant, disables when `loading`, forwards refs.

### A.3 `<Alert>` primitive
**File:** `src/components/ui/Alert.tsx` (new)
**Props:** `variant: "success" | "error" | "warning" | "info"`, `onDismiss?: () => void`, children.
**Approach:** Semantic tokens (`--success-bg`, `--danger-bg`, etc.), `role="alert"` on error/warning, `role="status"` on success/info. Dismiss button has `aria-label="Dismiss"`.
**Replaces:** every inline `bg-red-50 border border-red-200 text-red-700` block currently scattered across pages.
**Tests:** renders with correct role, calls `onDismiss` when X clicked.

### A.4 `<Badge>` primitive
**File:** `src/components/ui/Badge.tsx` (new)
**Props:** `variant: "type-federal" | "type-state" | "type-local" | "type-private" | "status-open" | "status-closed" | "status-forecasted" | "women" | "veteran" | "minority" | "startup" | "existing" | "rolling" | "urgent"`, children.
**Approach:** Single component, one variant → one token pair. No more hardcoded `bg-pink-100 text-pink-800`.
**Side effect:** Retire `TYPE_COLORS` and `STATUS_COLORS` Tailwind-string maps in `src/lib/constants.ts`. Update `GrantCard`, `GrantList`, `grants/[id]/page.tsx`, `DeadlineCalendar` to use `<Badge>` instead of those maps.

### A.5 `<Tag>` primitive
**File:** `src/components/ui/Tag.tsx` (new)
**Props:** `onRemove?: () => void`, children. Used for location/industry chips and (later) active-filter chips.
**Tests:** clicking X calls `onRemove`, keyboard (Enter/Space) on X also triggers.

### A.6 `<FormField>` primitive
**File:** `src/components/ui/FormField.tsx` (new)
**Props:** `label`, `htmlFor`, `error?`, `hint?`, `required?`, children.
**Approach:** Renders `<label>` with `htmlFor`, optional `*` for required, optional hint (`<span class="text-xs muted">`) and error (`role="alert"`). Children are the raw input/select/textarea so consumers control the element.
**Replaces:** the manual `labelClass` / `inputClass` pattern in `admin/grants/[id]/edit/page.tsx`, `admin/invites/page.tsx`, `admin/blacklist/page.tsx`, `login/page.tsx`, `register/page.tsx`.

### A.7 `<Toaster>` + `toast()` API
**Files:**
- `src/components/ui/Toaster.tsx` (new)
- `src/lib/toast.ts` (new) — tiny zustand-free event-bus + `toast.success|error|info|warning(message)`.
- `src/app/layout.tsx` — mount `<Toaster />` at the root.
**Approach:** Use `sonner` to avoid reinventing this (actively maintained, small, has `aria-live` baked in). If adding a dependency is off the table, implement a minimal event-bus toaster: subscribe in `<Toaster />`, keep an array in state, render with `role="status"` + `aria-live="polite"`, auto-dismiss after 4s.
**Tests:** emitting a toast renders, auto-dismisses, X dismisses immediately.

### A.8 `<Drawer>` primitive
**File:** `src/components/ui/Drawer.tsx` (new)
**Props:** `open`, `onClose`, `side: "left" | "right" | "bottom"`, `ariaLabel`, children.
**Approach:** Uses native `<dialog>` like `ConfirmModal` for proper a11y. Focus trap handled by `<dialog>`. Close on `Escape`, backdrop click, or programmatic. Slide-in animation via Tailwind transition.
**Used by:** Phase B mobile NavBar (P0-1), Phase B mobile filter sheet (P1-4).
**Tests:** Escape closes, backdrop click closes, focus returns to trigger on close.

### A.9 Migrate existing components to primitives
**Files (in order):**
1. `src/components/ConfirmModal.tsx` — `bg-red-600/red-700` → `<Button variant="danger">`. Already uses `<dialog>` so minimal churn.
2. `src/components/GrantCard.tsx` — replace every hardcoded pill with `<Badge>`, replace delete `<button>` with `<Button variant="ghost" size="sm">`, replace `ring-blue-500 border-blue-300` selected state with a semantic `--selected-ring` token.
3. `src/components/GrantList.tsx` — replace pagination `<button>`s with `<Button variant="secondary">`, Delete/Cancel/Select toolbar with `<Button>`, "X selected" text with `text-[var(--primary)]`.
4. `src/app/grants/[id]/page.tsx` — badges → `<Badge>`, action anchors → `<LinkButton>` variants, urgent/amount cards use tokens not `bg-red-50`/`bg-emerald-50`.
5. `src/components/DeadlineCalendar.tsx` — `TYPE_DOT_COLORS` → tokens, `getCellBorderClass` → tokens.
6. Admin pages (`admin/invites/page.tsx`, `admin/blacklist/page.tsx`, `admin/grants/[id]/edit/page.tsx`, `admin/page.tsx`, `admin/layout.tsx`) — every inline alert → `<Alert>`, every form label/input pair → `<FormField>`, every submit/cancel button → `<Button>`/`<LinkButton>`.
7. `src/app/login/page.tsx`, `src/app/register/page.tsx` — same form migration.
8. `src/app/error.tsx` — `<Button>` for retry.
9. `src/lib/constants.ts` — delete `TYPE_COLORS` and `STATUS_COLORS`.

**Verification for Phase A:**
- Automated: `npm run lint && npm run typecheck && npm test && npm run build` — all green.
- Manual: open every page in dev at 1440 and 375, toggle OS dark mode, confirm no visual drift.
- `grep -rE "(bg|text|border|ring)-(red|blue|green|pink|indigo|amber|emerald|slate)-[0-9]" src/` should return only files explicitly out of scope (if any). Target: zero hits in the files touched above.
- axe DevTools on every page: no new violations introduced.


## Phase B — Critical UX fixes

**Goal:** Ship the P0s and the highest-leverage P1s on top of the Phase A foundation. This is the user-visible phase.

**Success criteria:**
- Dashboard, grant detail, calendar, export, admin look correct at 375px width.
- Dark mode respects OS preference.
- Urgent deadlines have a non-color signal.
- Status filter visibly reads "Open, Forecasted" by default (not "All").
- Active filters show as removable chips above the result grid.
- Admin-side success/error feedback is a toast, not an inline banner.

### B.1 Mobile NavBar with hamburger (P0-1)
**Files:**
- `src/components/NavBar.tsx`
- (consumes `Drawer` from A.8)
**Approach:**
1. Split render into `<DesktopNav>` (`hidden md:flex`) and `<MobileNav>` (`md:hidden`).
2. `<MobileNav>` shows wordmark + hamburger `<Button variant="ghost" size="sm" aria-label="Open menu" aria-expanded={open} aria-controls="mobile-nav">`.
3. Hamburger opens `<Drawer side="right" open={open} onClose={...} ariaLabel="Main navigation">` containing the same link list (Dashboard / Deadlines / Export / Admin / Login|Logout).
4. Drawer closes automatically on link click via `onClose`.
5. Active-link styling reused from desktop via an inner `<NavLinks />` subcomponent that takes an `onNavigate` callback.
**Edge cases:**
- Route change must close the drawer (subscribe to pathname change via `usePathname`).
- Body scroll lock while drawer is open — `Drawer` handles this via `<dialog>`.
- `loading` state for admin auth — render link slots anyway to prevent layout jumps, use skeleton.

### B.2 Make default status filter visible (P0-2)
**Files:** `src/app/page.tsx`, possibly `src/components/GrantFilters.tsx`.
**Approach:**
1. The current default `["OPEN", "FORECASTED"]` lives in `parseFiltersFromParams` at `src/app/page.tsx:32`. Keep it — the product intent (commit `5796e50`) is correct.
2. Fix the visibility gap: when filters.status is populated, `GrantFilters` already renders the labels via the MultiSelect summary. The problem is that status is applied when URL has NO param, so when the page loads fresh the filter shows OPEN+FORECASTED **already selected** — which is what we want. Verify this is actually true by loading `/` and confirming the Status field shows "Open, Forecasted", not "All".
3. If the field still shows "All", the bug is elsewhere: `filters.status` is being set to `undefined` on the initial render before effects run. Fix by making `parseFiltersFromParams` run synchronously in `useState(() => parseFiltersFromParams(...))`.
4. Add an integration-style test: render `<Dashboard />` with no query params, expect Status field summary to equal "Open, Forecasted".
**Note:** This is the item most likely to be "already correct" — confirm first, fix only if needed.

### B.3 Non-color urgency signal (P0-3)
**Files:**
- `src/components/GrantCard.tsx:104-111`
- `src/app/grants/[id]/page.tsx:99-111`
- `src/components/DeadlineCalendar.tsx:29-35, 208-222`
**Approach:**
1. When `isDeadlineUrgent(grant.deadline)`, render a `<Badge variant="urgent">Closing soon</Badge>` next to the date, and prefix the date string with a ⚠ / clock icon (use `lucide-react` if adopted, otherwise inline SVG).
2. On grant detail, the urgent card keeps its red tint but adds the badge + icon inside the label row.
3. On the calendar, urgent cells get a red border AND a small ⚠ marker overlaying the cell (not just a background change). Keyboard users relying on screen readers still get the count in the existing `aria-label`; add "(closing soon)" to that label for urgent days.
4. Compute "days until deadline" once in a shared helper and expose it from `src/lib/deadline.ts` so all three sites use the same threshold.
**Tests:** `src/lib/__tests__/deadline.test.ts` already has deadline helpers — extend with the urgent-threshold cases.

### B.4 Dark mode wiring (P0-5)
**Files:** `src/app/globals.css` (already handled in A.1), plus any leftover hardcoded colors found during Phase B that Phase A missed.
**Approach:**
1. Nothing to do here if A.1 and A.9 were complete.
2. During Phase B, grep for any newly-introduced hardcoded color in new code — reject any such.
**Verification:** `prefers-color-scheme: dark` at the OS level flips the whole app cleanly, including calendar, admin pages, modals, drawers.

### B.5 Active filter chips row (P1-3)
**Files:**
- `src/components/ActiveFilterChips.tsx` (new)
- `src/app/page.tsx` (mount the component between `<SearchBar />` and `<GrantList />`)
- `src/app/export/page.tsx` (optional — may reuse here too)
**Approach:**
1. Component accepts `filters: FilterType`, `search: string`, `onChange: (filters, search) => void`.
2. For each populated filter dimension, render `<Tag onRemove={...}>Federal</Tag>` (one per value). Use human labels from the existing option maps in `GrantFilters.tsx` — lift those maps to `src/lib/filter-labels.ts` so both components share them.
3. Search is also a chip: `<Tag onRemove={() => setSearch("")}>"sba"</Tag>`.
4. If any filter is populated, append `<Button variant="ghost" size="sm" onClick={clearAll}>Clear all</Button>`.
5. Hide the row entirely when nothing is active.
6. Status default (from B.2): do NOT render chips for the default OPEN+FORECASTED — only chip when the user has explicitly deviated. This matches the "default" mental model.
**Tests:** unit test for the active-chip computation (pure function that takes filters and returns a label array).

### B.6 Mobile filter drawer (P1-4)
**Files:**
- `src/app/page.tsx`
- (consumes `Drawer` from A.8)
**Approach:**
1. On `<lg` viewports, replace the `<aside className="w-full lg:w-64">` with a sticky `<Button variant="secondary">` labeled `"Filters" + activeCount`. On `lg+`, keep the sidebar as-is.
2. Button opens `<Drawer side="left" ariaLabel="Filters">` containing the same `<GrantFilters>` component.
3. Drawer includes an "Apply" button at the bottom that closes it. Filter changes inside the drawer commit live; Apply is just a visual close affordance.
4. Count badge next to "Filters" shows number of populated filter dimensions (same computation as B.5).
**Regression guard:** `lg+` behavior must be byte-identical to current.

### B.7 Replace ad-hoc banners with toasts (P1-9)
**Files:**
- `src/app/admin/invites/page.tsx`
- `src/app/admin/blacklist/page.tsx`
- `src/app/admin/grants/[id]/edit/page.tsx`
- `src/app/export/page.tsx`
- `src/app/page.tsx`
**Approach:**
1. On success of any admin write (create invite, add/remove blacklist URL, save grant), fire `toast.success("Invite created")`, `toast.success("Saved")`, etc.
2. On error, fire `toast.error(message)`.
3. Delete existing success/error `<Alert>` blocks on these pages — except for in-form validation errors, which stay in place near the relevant field.
4. On the dashboard, the delete flow currently uses the error banner at `src/app/page.tsx:235-242`. Migrate to a toast for fetch failures; keep inline for filter-specific empty states.
5. Clipboard feedback ("Copied!", "Link copied!") becomes a toast too — removes the transient-state dance in `export/page.tsx:97-98`.

**Verification for Phase B:**
- Mobile (375px DevTools): hamburger opens, filters drawer opens, chips show above results, tab order makes sense, all toasts audible via VoiceOver `aria-live`.
- Desktop (1440): no visual regressions.
- Dark mode toggled at OS level: all surfaces adapt.
- `/` with fresh cache: Status filter visibly shows "Open, Forecasted" in the label.
- Urgent grant: card shows ⚠ badge AND red text; detail page shows ⚠ badge in the deadline card; calendar urgent day shows ⚠ marker.
- Adding a blacklist URL: toast appears, list refreshes, no inline banner.


## Phase C — Discovery completeness

**Goal:** Expose the filter/sort capabilities the data model already supports, fix discovery bugs, and make rolling grants first-class.

**Success criteria:**
- User can sort by deadline, amount, title, or date added in either direction. Sort round-trips through the URL.
- User can filter by Amount, Location, Industry from the sidebar/drawer.
- Search input communicates what it matches.
- Rolling grants have a dedicated badge and a sort preset that surfaces them first.
- Post-delete pagination no longer strands users on empty filtered pages.
- Bulk-delete selection survives pagination.

### C.1 Sort API + UI (P1-1)
**Files:**
- `src/app/api/grants/route.ts:11-41`
- `src/lib/grant-query.ts`
- `src/lib/api-utils.ts` (add `parseSortParams`)
- `src/lib/query-params.ts`
- `src/app/page.tsx`
- `src/components/GrantList.tsx` (add sort dropdown in header)
- `src/lib/__tests__/grant-query.test.ts`
**Approach:**
1. New utility `parseSortParams(params): { orderBy: Prisma.GrantOrderByWithRelationInput[] }`. Accept `sort` and `dir`:
   - `sort=deadline` (default) → `[{ deadline: { sort: dir, nulls: "last" } }, { createdAt: "desc" }]`
   - `sort=amount` → `[{ amountMax: { sort: dir, nulls: "last" } }, { deadline: "asc" }]`
   - `sort=recent` → `[{ createdAt: dir }]`
   - `sort=title` → `[{ title: dir }]`
   - Default `dir` is `asc` for deadline/title, `desc` for amount/recent.
   - Invalid values fall back to default.
2. Replace the hardcoded `orderBy` in `route.ts:21` with the parsed value.
3. Extend `buildGrantQueryParams` to include `sort` and `dir` when non-default.
4. UI: add a sort `<select>` (or `<Button>` with a small dropdown if fancy) in the `GrantList` header, next to "Showing X of Y". Wire to `filters.sort` / `filters.dir` in dashboard state.
5. Extend `FilterType` in `src/lib/types.ts` to include `sort?: SortKey; dir?: SortDir`.
6. Tests: new `parseSortParams` unit tests covering the four sort modes and defaults.

### C.2 Amount filter (P1-2a)
**Files:**
- `src/components/GrantFilters.tsx`
- `src/components/ui/AmountRange.tsx` (new, optional sub-component)
- `src/app/page.tsx` (parse amountMin/amountMax from URL)
- `src/lib/query-params.ts`
**Approach:**
1. Add an "Award Amount" section to `GrantFilters`. Simple version: two `<input type="number">` labeled "At least $" and "Up to $", with a preset row ("Any / $1k+ / $10k+ / $50k+ / $100k+").
2. Preset buttons set `filters.amountMin` only; leave max blank.
3. IMPORTANT copy note: because of the inverted semantics in `grant-query.ts:109-115`, the label must read "Maximum award of at least $X" not "Minimum". Add a `<FormField hint="We match grants whose cap is at least this value">` to make it obvious.
4. URL round-trip through `buildGrantQueryParams`.
5. Active filter chips (B.5) already render these via the generic loop — add a label formatter for amount range.
**Tests:** extend `grant-query.test.ts` with amount range scenarios (mostly existing but add chip-label logic).

### C.3 Location / Industry filters + meta endpoints (P1-2b)
**Files:**
- `src/app/api/meta/locations/route.ts` (new)
- `src/app/api/meta/industries/route.ts` (new)
- `src/components/ui/Combobox.tsx` (new, shared)
- `src/components/GrantFilters.tsx`
- `src/app/page.tsx`
**Approach:**
1. Meta endpoints:
   - `GET /api/meta/locations` → `["Iowa", "Des Moines", "Cedar Rapids", ...]` via `prisma.$queryRaw` on `SELECT DISTINCT unnest(locations) FROM "Grant" ORDER BY 1`.
   - `GET /api/meta/industries` → same pattern on `industries`.
   - Cache header `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`. Low write volume, high read volume.
2. Shared `Combobox` primitive: filtering input with a suggestion list, keyboard nav (Up/Down/Enter/Escape). Can reuse logic from `MultiSelect` in `GrantFilters.tsx` — extract a common hook `useFilterableList`.
3. Add two Combobox instances to `GrantFilters`: Location (single value, API already single) and Industry (single value).
4. URL round-trip.
**Tests:** API integration test for both meta endpoints (add `src/app/api/meta/__tests__/` or add to existing test harness). Combobox unit test.

### C.4 Search scope helper text (P1-5)
**Files:**
- `src/components/SearchBar.tsx`
- `src/lib/grant-query.ts` (optional short-term extension)
**Approach:**
1. Short term (Phase C): update placeholder to `"Search titles and descriptions…"` and add a `hint` prop to render gray helper text below: `"Use filters for source, location, or type."`.
2. Medium term (Phase C if bandwidth, else defer): extend `grant-query.ts:86-91` OR clause to include `sourceName: { contains: search, mode: "insensitive" }` and `eligibility: { contains: search, mode: "insensitive" }`. Add a test for each new field. Adjust helper copy if we do this.
3. Full-text tsvector is out of scope.

### C.5 Rolling / no-deadline as first-class state (P1-6)
**Files:**
- `src/lib/deadline.ts` — add `isRolling(deadline)` helper
- `src/components/GrantCard.tsx` — if rolling, render `<Badge variant="rolling">Rolling</Badge>` in the badge row and skip the urgent check
- `src/app/grants/[id]/page.tsx` — same treatment in the deadline card (show "Rolling deadline" prominently instead of the date format fallback)
- `src/app/api/grants/route.ts` — new sort preset: if `sort=deadline` and a new param `rollingFirst=true` is passed, use `orderBy: [{ deadline: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }]`
- `src/components/GrantList.tsx` — sort dropdown includes a "Rolling first" option (which sets sort=deadline + rollingFirst=true)
**Tests:** extend `grant-query.test.ts` for the new sort, extend `deadline.test.ts` for `isRolling`.

### C.6 Fix delete-pagination bug (P1-7)
**Files:** `src/app/page.tsx:171-182`
**Approach:**
1. Replace the unfiltered count probe with `buildGrantQueryParams(filters, search)` so the post-delete overflow check reflects the active filters.
2. After recomputing totalPages, if `currentPage > countData.totalPages && countData.totalPages > 0`, jump to `countData.totalPages`. If `countData.totalPages === 0`, jump to page 1 (empty state will render).
3. Add a unit test for the query builder (already tested) — no new test needed for the integration flow unless we add a component test for the dashboard.

### C.7 Persist selection across pages (P1-8)
**Files:** `src/app/page.tsx:130-132`
**Approach:**
1. Delete the `useEffect` that clears `selectedIds` on page change.
2. The existing `Delete (N)` button and "X selected" counter already handle the cross-page case because they operate on `selectedIds`, not on the visible page.
3. Add a "Clear selection" `<Button variant="ghost" size="sm">` next to the counter when `selectedIds.size > 0`, so users have an explicit undo.
4. Edge case: if a selected grant is deleted by another admin (or by this admin from a later page), it falls out of `grants` on next fetch but stays in `selectedIds`. Add a prune step after each fetch: remove ids from `selectedIds` that no longer appear in any fetched page. Simplest version: prune on bulk delete success.

**Verification for Phase C:**
- `/?sort=amount&dir=desc` → biggest-award grants first. Reload → same. Back button → previous sort.
- Set amountMin to 10000 → only grants with `amountMax >= 10000` return. Copy says "Maximum award of at least $10,000".
- Pick "Des Moines" from location combobox → results filter. URL reflects.
- Rolling grants have a green "Rolling" badge on card and detail. Sort preset "Rolling first" puts them at the top.
- Filter to a small set (e.g., 41 results on 3 pages), go to page 3, delete all visible grants → lands on page 2 of 2 with filters intact. Not a blank page at `/?page=3`.
- On page 1, select 3 grants, go to page 2, select 2 more, click Delete (5) → all 5 delete, toast confirms, selection clears.


## Phase D — Polish + a11y

**Goal:** Close the remaining accessibility gaps and medium-priority findings. This phase has more items but each is smaller.

**Success criteria:**
- axe DevTools reports zero critical issues on every page.
- Calendar is fully keyboard-navigable per W3C date-picker pattern.
- Admin edit form warns before losing unsaved changes.
- Locations/industries use tag-style inputs with autocomplete.
- Grant detail has a related-grants rail.
- Icon system migrated (or explicitly deferred).

### D.1 Calendar keyboard navigation (P0-4)
**Files:** `src/components/DeadlineCalendar.tsx`
**Approach:**
1. Wrap the day grid in `role="grid"`, each row in `role="row"`, each cell in `role="gridcell"`.
2. Implement roving `tabIndex`:
   - One cell in the grid has `tabIndex=0` at any time (the "active" one, starts as today or first of month).
   - All others have `tabIndex=-1`.
   - Focus programmatically follows arrow keys.
3. Key handlers on the grid:
   - ArrowLeft / ArrowRight → prev/next day, wrap at row edges
   - ArrowUp / ArrowDown → prev/next week
   - Home / End → start/end of current row
   - PageUp / PageDown → previous/next month (update `year`/`month` state, keep focused-day-of-month sticky if possible)
   - Enter / Space → select (existing behavior)
4. When month changes via arrow keys past a week boundary into another month, update state and place focus on the new month's day.
5. Ensure screen readers still announce the existing `aria-label` on focus change.
**Tests:** manual keyboard walk-through per W3C APG "Date Picker Dialog" pattern. axe DevTools scan. Unit test for the arrow-key state machine if it's extracted into a hook.

### D.2 "Clear All Filters" visibility + active count (P2-1)
**Files:** `src/components/GrantFilters.tsx`
**Approach:**
1. Compute `activeCount` = number of populated filter dimensions (excluding the default status preset from B.2).
2. Header reads `"Filters"` normally, or `"Filters (3 active)"` if `activeCount > 0`.
3. Style "Clear All Filters" as `<Button variant="ghost" size="sm">`, hidden when `activeCount === 0`.
4. Subsumed partially by B.5 (active chips do most of the heavy lifting); this is the sidebar-local version.

### D.3 Server-trusted CLOSED computation (P2-2)
**Files:**
- `src/app/api/grants/route.ts`
- `src/lib/types.ts`
- `src/components/GrantCard.tsx`
- `src/app/grants/[id]/page.tsx`
**Approach:**
1. Add a computed `displayStatus` field to the API response per grant: `deadlinePassed ? "CLOSED" : status`. Compute on the server using the same `now` that the status filter uses.
2. Update `GrantListItem` type to include `displayStatus`.
3. Remove client-side `isDeadlinePassed` + `displayStatus` recomputation in `GrantCard.tsx:22-24` and `grants/[id]/page.tsx:42-43`. Use the server-provided value.
4. Keep `isDeadlineUrgent` on the client — that's a UI decision, not a data fact.

### D.4 Calendar state composition fix (P2-3)
**Files:** `src/components/DeadlineCalendar.tsx:29-35`
**Approach:**
1. Replace `getCellBorderClass` with class composition:
   - Base class always applied
   - `urgent` → background tint
   - `today` → bold date number + different ring color
   - `selected` → outer ring (on top of any urgent/today styling)
2. Selected + urgent should look like a selected cell with the red background; today + urgent should show both cues.
3. Verify with a day that's today, urgent, AND selected simultaneously (e.g., seed a grant due today and click it).

### D.5 Unsaved-changes warning (P2-4)
**Files:** `src/app/admin/grants/[id]/edit/page.tsx`
**Approach:**
1. Capture initial form snapshot via `useRef` after fetch completes.
2. Compute `dirty` = `JSON.stringify(form) !== JSON.stringify(initial.current)`. Cheap, fine for this form size.
3. On Cancel link click: if `dirty`, `e.preventDefault()` and open `<ConfirmModal>` ("You have unsaved changes. Discard?").
4. Add `useEffect` to attach/detach a `beforeunload` listener gated on `dirty`. Remember to remove on unmount.
5. Reset `dirty` on successful save.

### D.6 Tag-input for locations / industries (P2-5)
**Files:**
- `src/app/admin/grants/[id]/edit/page.tsx:418-449`
- `src/components/ui/TagInput.tsx` (new, or extended from the Combobox in C.3)
- `src/app/api/meta/locations/route.ts`, `industries/route.ts` (reused from C.3)
**Approach:**
1. `TagInput` stores an array of strings. On Enter or Tab inside the input, commit the current typed value as a new tag. Backspace on empty input deletes the last tag.
2. Suggestions dropdown sourced from the C.3 meta endpoints; filter by substring; click or Enter on a suggestion adds it as a tag.
3. Submit: the form serializes the array to the existing JSON body shape at `edit/page.tsx:131-138` — no API change needed.
4. Backwards-compat: if the grant row has values not in the meta list, they still render as tags and can be kept.

### D.7 Related grants rail (P2-6)
**Files:**
- `src/app/grants/[id]/page.tsx:185-232`
- (optional) `src/lib/grant-query.ts` — helper for "similar" query
**Approach:**
1. After the action buttons block, add a section `<h2>Similar grants</h2>`.
2. Query (in the same server component) for grants with the same `grantType`, overlapping `eligibleExpenses` (any), `id !== current`, limit 3, order by deadline asc nulls last.
3. Render as a small `grid md:grid-cols-3 gap-4` of `<GrantCard grant={g} />` (read-only — no selection/delete props).
4. If zero results, omit the section entirely.

### D.8 Login copy fix (P2-7)
**Files:** `src/app/login/page.tsx`
**Approach:** Add a subtitle under the heading: "Admin access only. Contact the site owner to request an invite." Optionally include a mailto or external link if one exists in env config.

### D.9 Empty-state improvements (P2-8)
**Files:** `src/components/GrantList.tsx:81-105`
**Approach:**
1. Accept a prop `hasActiveFilters: boolean` (or compute from a new prop `activeFilterCount`).
2. If `hasActiveFilters`: render heading "No grants match your filters" plus a `<Button onClick={onClearFilters}>Clear all filters</Button>`.
3. If not: "No grants available yet" plus a link to `/calendar`.
4. Wire `onClearFilters` from `page.tsx` (reuse the `Clear All` logic).

### D.10 Tab order on dashboard (P2-9)
**Files:** `src/app/page.tsx:198-229`
**Approach:**
1. Move the Export button out of the title row and into the `GrantList` header next to the sort dropdown (or just after the search bar in DOM order).
2. Use CSS grid or flex order to keep the visual position if needed.
3. Verify with keyboard: first tab after skip-link lands on the search input.

### D.11 AdminEditButton visibility (P2-10)
**Files:** `src/components/AdminEditButton.tsx`
**Approach:**
1. Replace the plain `<a>` with `<LinkButton variant="secondary" size="sm">` + pencil icon.
2. Label: "Edit". Icon provides the affordance, text provides the screen-reader label.
3. Positioned top-right of the grant title row (already is).

### D.12 Filter loading nudge (P2-11)
**Files:** `src/app/page.tsx` or `src/components/GrantList.tsx`
**Approach:**
1. Dim the result grid (opacity 0.6) immediately on any filter/search change, independent of the 300ms debounce.
2. When the new fetch completes, restore opacity.
3. Simple state: add `pending` boolean that flips true on filter change, flips false on fetch success.
4. Don't use the skeleton for this — the skeleton is for initial load; dimming is for refinement.

### D.13 Icon system migration
**Files:** every component using inline SVG (`NavBar`, `GrantCard`, `GrantList`, `SearchBar`, `GrantFilters`, `DeadlineCalendar`, `error.tsx`, `export/page.tsx`, `grants/[id]/page.tsx`, etc.)
**Approach:**
1. Add `lucide-react` dependency.
2. Find/replace inline SVG with icon components: `Search`, `Filter`, `Download`, `Calendar`, `ChevronLeft`, `ChevronRight`, `X`, `Trash2`, `Edit2`, `AlertTriangle`, etc.
3. Icons inherit current color via `stroke="currentColor"` by default.
4. This is optional for Phase D — can be deferred if the token migration in Phase A already achieved the main goal.

### D.14 Typography scale
**Files:** `src/app/globals.css` (or new `src/app/typography.css` imported from globals)
**Approach:**
1. Define CSS utilities or component classes:
   - `.text-h1` → `text-3xl font-bold`
   - `.text-h2` → `text-xl font-semibold`
   - `.text-h3` → `text-lg font-semibold`
2. Audit `grants/[id]/page.tsx:88` and unify with the rest (currently `text-2xl`).
3. Not a behavior change; catches future drift.

**Verification for Phase D:**
- axe DevTools: zero critical on `/`, `/grants/[id]`, `/calendar`, `/export`, `/login`, `/register`, `/admin`, `/admin/invites`, `/admin/blacklist`, `/admin/grants/[id]/edit`.
- Calendar keyboard: tab into grid, arrow/PgUp/PgDn/Home/End all work, Enter selects, month flips when crossing month boundaries.
- Edit form: change a field, click Cancel → modal. Close tab → browser `beforeunload` prompt.
- Edit form: type in Locations → see suggestions. Add 3 tags, remove one, save → DB reflects array.
- Grant detail: "Similar grants" rail appears when matches exist, otherwise absent.
- Login: subtitle copy present.
- Dashboard empty state with filters applied: shows "Clear all filters" button; clicking it restores results.
- Dashboard tab order: after skip-link, first focus is search input.
- Filter change: grid dims immediately, restores on fetch.
- If D.13 shipped: no inline SVG left in the touched files.


## Cross-phase: automated checks

Every phase's PR must pass the same gate before it is merged:

```bash
npm run lint
npm run typecheck   # or: npx tsc --noEmit
npm test            # extend suites for new logic
npm run build
```

**Suggested new/updated test files per phase:**

- **Phase A**
  - `src/components/ui/__tests__/Button.test.tsx`
  - `src/components/ui/__tests__/Alert.test.tsx`
  - `src/components/ui/__tests__/Badge.test.tsx`
  - `src/components/ui/__tests__/Toaster.test.tsx`
  - `src/components/ui/__tests__/Drawer.test.tsx`
- **Phase B**
  - `src/lib/__tests__/deadline.test.ts` — extend for the urgent-threshold helper
  - `src/components/__tests__/ActiveFilterChips.test.tsx` — pure chip-label computation
- **Phase C**
  - `src/lib/__tests__/grant-query.test.ts` — sort modes, rolling sort, amount edge cases
  - `src/app/api/meta/__tests__/locations.test.ts` — smoke test the distinct-values query
- **Phase D**
  - `src/components/__tests__/DeadlineCalendar.test.tsx` — arrow-key navigation
  - `src/app/admin/grants/[id]/edit/__tests__/dirty-tracking.test.tsx` — unsaved-changes warning

## Out-of-scope (documented for completeness)

Explicitly deferred to a later cycle, per the review's P3 section:
- Saved searches / email alerts
- Bookmark / "save for later" for non-admin visitors
- Full-text (tsvector) search
- Export column selection / XLSX format
- Sentry wiring and error-tracking hookup
- Invite token path-segment refactor (security issue; own track)

These are valuable but don't fit inside Phases A–D without expanding the scope.

## Execution order recap

1. Start Phase A as a single PR. Land it before anything else.
2. Phase B depends on A; start only after A is on `claude/ux-architecture-review-tUxnk`.
3. Phase C and D can run in parallel after B — they touch mostly different files. If executed sequentially, prefer C → D because D's polish items are easier to review once discovery features are in place.
4. Each phase should end with a manual walkthrough at 1440 and 375, plus OS dark-mode toggle, before marking complete.

