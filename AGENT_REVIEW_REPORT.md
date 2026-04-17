# Code Review Report — Iowa Grant Scanner

Generated: 2026-04-17

## Executive Summary

Iowa Grant Scanner is a Next.js 14 / Prisma / PostgreSQL app that scrapes multi-source grant data and surfaces it to Iowa small business owners. Overall the codebase is well-structured with good security fundamentals (bcrypt, JWT issuer/audience pinning, HttpOnly cookies, CSRF origin check, parameterized Prisma queries), graceful scraper degradation, and tested timezone handling. The top concerns are (1) an admin-invite token transported via URL query string that leaks through browser history/referrers, (2) SSRF surface in scraper page/URL-health helpers that don't validate URLs, (3) CSP that still allows `unsafe-inline` for scripts, and (4) accessibility gaps (modal/drawer focus traps, dynamic results not announced) that will meaningfully hurt non-technical and assistive-tech users — the app's core audience.

## Critical Findings (must fix before shipping)

| # | Category | Finding | File(s) | Recommended Fix |
|---|----------|---------|---------|-----------------|
| 1 | Security / Privacy | Admin invite token transported in URL query params; leaks via browser history, Referer, proxies, analytics | `src/app/admin/invites/page.tsx`, `src/app/api/admin/invites/route.ts` | Deliver token via URL fragment (`#token=`) or a POST-only acceptance flow; never render it in a GET querystring |
| 2 | Security (SSRF) | `fetchPageDetails()` performs `axios.get()` on any URL without `isSafeUrl()` check | `src/lib/scrapers/page-utils.ts:114-148` | Call `isSafeUrl(url)` at function entry; return null and log when blocked |
| 3 | Security (SSRF) | `checkUrlHealth()` fetches arbitrary URLs with no validation | `src/lib/scrapers/url-health.ts:38-94` | Add `isSafeUrl(url)` guard before `axios.head/get` |
| 4 | Security (SSRF/XSS) | Grant `PUT` accepts any string for `sourceUrl` / `pdfUrl` — `javascript:` or `http://169.254.169.254` accepted | `src/app/api/grants/[id]/route.ts:69-96` | Refine Zod schema with `validateUrl` (protocol + `isSafeUrl` check) |
| 5 | Security (XSS) | CSP allows `unsafe-inline` for both `script-src` and `style-src`, neutralizing CSP as XSS defense | `next.config.mjs:22-24` | Replace with per-request nonce in middleware; remove `unsafe-inline` for scripts |
| 6 | Accessibility | `ConfirmModal` has no focus trap — Tab escapes to background content; blocks keyboard-only users | `src/components/ConfirmModal.tsx:37-40` | Implement focus trap (loop first/last focusable) and restore focus on close |
| 7 | Accessibility | `Drawer` uses `<dialog open>` with only initial focus — no focus trap | `src/components/ui/Drawer.tsx:73-110` | Add focus trap + `returnFocus` to opener on close |
| 8 | Accessibility | Grant list re-fetch on filter change not announced to AT; only visual opacity dim | `src/app/page.tsx:279-280`, `src/components/GrantList.tsx` | Add `aria-busy={pending}` + `aria-live="polite"` status region announcing "Updating results…" |
| 9 | Performance | Change-detection loop fetches N URLs sequentially via blocking `await axios.get()` — 50 URLs × 5s timeout ≈ 250s worst case | `src/lib/change-detection/detector.ts:25-71` | Parallelize with `p-limit(4-8)` / `Promise.allSettled` |
| 10 | Performance | `GET /api/grants` runs `findMany` + `count` with identical WHERE clauses; count is a second full scan on text-search paths | `src/app/api/grants/route.ts:20-29`, `src/lib/grant-query.ts:86-91` | Avoid count on every request (use `hasNextPage` via `take: limit+1`); add Postgres trigram / GIN index for ILIKE on `title`/`description` |
| 11 | Infra | Rate limiter reads `x-forwarded-for` which is client-spoofable in multi-hop; on Railway confirm which header is actually trusted | `src/middleware.ts:74-79` | Only trust a documented proxy-set header (e.g. `x-real-ip`) and ignore `x-forwarded-for` unless you strip it at the edge |

## Warnings (should fix soon)

| # | Category | Finding | File(s) | Recommended Fix |
|---|----------|---------|---------|-----------------|
| W1 | Security | Login Zod schema accepts any non-empty string for email (no `.email()`); password only `min(1)` vs register's `min(12)` | `src/lib/http/schemas.ts:11-14` | `z.string().email()` + `z.string().min(12)` |
| W2 | Security | No rate limiting on `/api/admin/*` paths at middleware level | `src/middleware.ts:8-12` | Add `"/api/admin": { windowMs: 60_000, max: 30 }` |
| W3 | Security | Logout only clears cookie; doesn't bump `tokenVersion`, so a stolen JWT remains valid until 7-day expiry | `src/app/api/auth/logout/route.ts` | Increment `AdminUser.tokenVersion` on logout |
| W4 | Accessibility | Form inputs lack visible password/amount guidance; amount filters use `sr-only` labels only | `src/app/login/page.tsx:60-64`, `src/app/register/page.tsx:116-135`, `src/components/GrantFilters.tsx:109-144` | Add visible hint text (min-length, units, meaning of "cap") |
| W5 | Accessibility | `DeadlineCalendar` encodes urgency only via color (`bg-[var(--danger-bg)]`) — fails color-blind + screen-reader users | `src/components/DeadlineCalendar.tsx` | Add `aria-label` with date + count + urgency text; add icon/text indicator |
| W6 | Accessibility | `Combobox` / `TagInput` lack `aria-required` and visible required indicator | `src/components/ui/Combobox.tsx:131-177`, `src/components/ui/TagInput.tsx` | Add `required`, `aria-required="true"`, visual `*` when required |
| W7 | Accessibility | `GrantCard` selection checkbox has no label tying it to the grant | `src/components/GrantCard.tsx:69-80` | Add `aria-label={`Select ${grant.title}`}` |
| W8 | Accessibility | Export-page format buttons aren't grouped as a radio-like set | `src/app/export/page.tsx:306-324` | Wrap in `<fieldset><legend>` or `role="radiogroup"` with `aria-labelledby` |
| W9 | Accessibility | Heading hierarchy skips levels on several pages (h1 → h2 sidebar then h2 content) | export, admin pages | Use h2 for main sections, h3 for sidebar/subsections |
| W10 | Accessibility | No `<footer>` landmark | `src/app/layout.tsx:34-36` | Add `<footer role="contentinfo">` with minimum content |
| W11 | Performance | Search triggers on every keystroke — debounce effect depends on `fetchGrants` callback whose identity changes each keystroke | `src/app/page.tsx:141-177` | Move timeout inside the effect with `[search, filters]` deps only |
| W12 | Performance | `GRANT_INCLUDE` always pulls `categories` + `eligibleExpenses` — list view serializes 10-20% extra payload it doesn't render | `src/lib/constants.ts:14-17`, `src/app/api/grants/route.ts` | Split `GRANT_INCLUDE_LIST` (minimal) vs `GRANT_INCLUDE_DETAIL` |
| W13 | Performance | Revalidation loads full Grant rows but uses only `id/sourceUrl/title/rawData/status` | `src/lib/scrapers/revalidate-existing.ts:123-141` | Add `select:` projection |
| W14 | Performance | AI operations in scraper pipeline run serially (validator → categorizer → deadline → description); fixed 500ms delay with no adaptive backoff | `src/lib/scrapers/index.ts:560-623`, `src/lib/ai/deadline-extractor.ts:157-158` | Parallelize independent passes under budget; add exponential backoff on 429 |
| W15 | QA | Grant description field is unbounded (`TEXT`) — 100k+ char PDFs can bloat API responses | `prisma/schema.prisma:Grant.description` | Cap at ~5,000 chars at insert time |
| W16 | DevOps | ~108 raw `console.log/error` calls remain (per TECHNICAL_DEBT.md); request-id not propagated through scraper/AI logs | `src/app/**`, `src/components/**`, `src/lib/scrapers/**`, `src/lib/ai/**` | Migrate to `log/logError/logWarn` utilities; thread `x-request-id` through |
| W17 | DevOps | No error-tracking service wired up; stdout JSON only | `src/instrumentation.ts` | Integrate Sentry or equivalent; already have the instrumentation hook |
| W18 | DevOps | `/api/health` doesn't verify DB — unhealthy DB still returns 200 | `src/app/api/health/route.ts` | Add `?deep=true` that runs `SELECT 1` via Prisma |
| W19 | Privacy | Admin email written to audit logs with no retention policy | `src/app/api/grants/route.ts:66` and other admin-audit log sites, `src/lib/errors.ts` | Document retention (e.g. 1 year); add log rotation/cleanup |
| W20 | Privacy | PDFs sent to Anthropic may contain PII (applicant examples, sample SSNs) with no pre-flight redaction | `src/lib/ai/pdf-parser.ts` | Document third-party processing in privacy policy; optional redaction pass |
| W21 | Privacy | No documented data-retention policy for grants / audit logs / invite tokens | repo-wide | Add policy doc; auto-expire invites; optional CLOSED-grant pruning |

## Suggestions (nice to have)

| # | Category | Finding | File(s) | Recommended Fix |
|---|----------|---------|---------|-----------------|
| S1 | Security | `hashPassword()` doesn't enforce min-length (only callers do) | `src/lib/auth.ts:23-25` | Throw if `password.length < 12` inside `hashPassword` |
| S2 | Security | Bulk `deleteMany` grants has no soft-delete / confirmation audit depth | `src/app/api/grants/route.ts:53-76` | Soft-delete column or explicit confirmation token for >N |
| S3 | Performance | Single-grant `GET /api/grants/[id]` sets no `Cache-Control` | `src/app/api/grants/[id]/route.ts:91-109` | `s-maxage=300, stale-while-revalidate=3600` |
| S4 | Performance | Filter pipeline allocates array per filter | `src/lib/scrapers/index.ts:591-604` | Single `.filter(g => filters.every(f => f.test(g)))` |
| S5 | Performance | `GrantCard` is `memo()`'d but parent passes fresh callbacks each render | `src/components/GrantList.tsx:282-290`, `src/components/GrantCard.tsx` | Wrap handlers in `useCallback` |
| S6 | Performance | AI budget tracks calls, not tokens | `src/lib/ai/budget.ts` | Track `usage.input_tokens + usage.output_tokens` from Anthropic response |
| S7 | Performance | `useMetaValues` refetches on every mount; uses `.catch` with no `AbortController` | `src/lib/hooks/useMetaValues.ts:26-42` | Module-level cache + `AbortController` |
| S8 | Performance | Scraper tuning constants hard-coded | `src/lib/scrapers/config.ts` | Parse from env to tune without redeploy |
| S9 | QA | Calendar year accepts 2000-2100; doc the cap and reject w/ 400 explicitly (already does) — add test | `src/app/api/grants/calendar/route.ts` | Add boundary test (`year=2500`) |
| S10 | QA | Admin UI should debounce scraper-trigger button (server lock already protects) | `src/app/admin/page.tsx` | Disable button for 500ms post-click |
| S11 | UX | Empty state when no filters active still vague | `src/components/GrantList.tsx:126-173` | Link directly to calendar + "check back daily" |
| S12 | DevOps | No documented JWT/CRON secret rotation procedure | `src/lib/auth.ts`, `src/lib/env.ts` | Runbook + admin endpoint to bump `tokenVersion` globally |
| S13 | Privacy | No `/privacy` or `/terms` page | `src/app/` | Add static pages |
| S14 | Privacy | No GDPR/CCPA self-serve export or delete for admins | `src/app/api/admin/` | `GET /api/admin/me/export`, `DELETE /api/admin/me` |
| S15 | Data Model | `rawData Json?` field is undocumented and stores arbitrary scraper output (possible PII) | `prisma/schema.prisma:28` | Document expected shape or prune to structured fields |
| S16 | Scope | Feature surface is expanding (shadow APIs, Airtable, article parsing) | `src/lib/scrapers/` | Quarterly scope review in TECHNICAL_DEBT.md |

## Pass-by-Pass Detail

### Security Audit

**What's working well**
- Prisma ORM everywhere; the two `$queryRaw` sites in `/api/meta/*` use `Prisma.sql` tagged templates — no SQL injection surface.
- No `dangerouslySetInnerHTML` / `innerHTML` in components; grant text rendered as plain text with `whitespace-pre-wrap`.
- Grant detail page uses `safeHref()` (`src/app/grants/[id]/page.tsx:20-29`) to block `javascript:` protocol injection in rendered links.
- Login uses `bcrypt.compare` against `DUMMY_HASH` on unknown email to prevent user enumeration via timing (`src/lib/auth.ts:14`).
- JWT signed with HS256, pinned issuer + audience, verified `tokenVersion` against DB per request (`src/lib/auth.ts:82-97`).
- Cron endpoint uses `timingSafeEqual` for `CRON_SECRET` comparison (`src/app/api/scraper/route.ts:9-14`).
- CSRF: middleware enforces origin-match on POST/PUT/DELETE (`src/middleware.ts:27-48`), with explicit skip for the Bearer-authed scraper endpoint.
- Cookies: `HttpOnly` + `Secure` (prod) + `SameSite=Lax` (`src/lib/auth.ts:100-108`).

**Findings** — see Critical #1-5, #11 and Warnings W1-W3, Suggestions S1-S2 above.

### Business Analysis

**Alignment**
- Product correctly implements the README's stated goal: aggregate Iowa small-business grants, filter by gender/stage/expense/location, surface deadlines.
- Enum coverage in `prisma/schema.prisma` maps 1:1 to the filter UI (GrantType, GrantStatus, GenderFocus, BusinessStage).
- Grant status transitions are non-destructive: CLOSED grants retained with `rawData.closedReason` audit trail; FORECASTED grants excluded from revalidation.

**Scope drift risk**
- Feature surface is steadily expanding: shadow API hunting, Airtable scrapers for niche sources (Ladies Who Launch), article-grant parsing, URL health revalidation, change-detection. Each is defensible in isolation, but TECHNICAL_DEBT.md already flags ~108 stray console.log calls from rapid feature work.
- Recommendation: include a quarterly scope review in TECHNICAL_DEBT.md; defer shadow-API registry promotion until grant-discovery core is ergonomic.

**Business-rule edge cases verified**
- Empty result set → `{ total: 0, data: [], totalPages: 0 }`.
- Null `deadline` grants kept as rolling; calendar groups by deadline or skips.
- Null `amountMin/amountMax` preserved and rendered as "Not specified".

**See also:** Suggestion S16 (quarterly scope review), S15 (untyped `rawData`).

### UX / Accessibility

**What's working well**
- Skip-to-content link present and shown on focus (`src/app/layout.tsx`).
- `NavBar` is a `<nav>` with a proper `aria-label`.
- Error UI uses `Alert` with `role="alert"`, dismissible and screen-reader friendly.
- Buttons have visible `focus-visible` rings; Combobox supports arrow keys + Enter.
- Responsive design uses `lg:`/`md:`/`sm:` breakpoints; a filter drawer replaces the sidebar on mobile.
- Color tokens produce AA-level contrast for primary text/buttons/badges.

**Gaps** — see Critical #6-8 and Warnings W4-W10, Suggestion S11 above.

Priority order for a one-sprint accessibility improvement:
1. Focus trap in `ConfirmModal` + `Drawer` (Critical #6-7).
2. `aria-busy` + `aria-live` on grant list during pending fetch (Critical #8).
3. Visible form-guidance for password + amount (W4).
4. Heading hierarchy + `<footer>` landmark (W9, W10).
5. Calendar urgency labelling for color-blind + AT users (W5).

### Performance

**Scraper pipeline** — biggest wins are here:
- Critical #9: parallelize change-detection URL probe loop with `p-limit`.
- W13: `select:` projection on revalidation queries.
- W14: parallelize independent AI passes; add exponential backoff on 429.
- S8: expose concurrency/batch constants via env.

**API surface**
- Critical #10: avoid unconditional `count()` on every list request; prefer `take: limit+1` to compute `hasNextPage`. Add a Postgres trigram (`pg_trgm`) GIN index if keeping ILIKE-based search — there's already a `trigram_search` migration referenced in `prisma/migrations/`, confirm it's applied to `title` + `description`.
- W12: split `GRANT_INCLUDE_LIST` from `GRANT_INCLUDE_DETAIL`.
- S3: add `Cache-Control: s-maxage=300, stale-while-revalidate=3600` to `/api/grants/[id]`.

**Frontend**
- W11: fix debounce effect dependencies.
- S5, S7: memoize filter handlers, cache meta-values fetch.

**AI budget**
- S6: track Anthropic token usage from `response.usage`, not only call count — batched PDF parses have highly variable token cost.

### QA / Edge Cases

**Verified safe**
- `parsePagination()` clamps `limit` to `[1, 100]` and `page` to `>=1` (`src/lib/api-utils.ts`).
- Calendar endpoint rejects NaN / out-of-range year and month (`src/app/api/grants/calendar/route.ts`).
- `sourceUrl` UNIQUE constraint + title-based dedup prevents duplicate inserts under concurrent scraper runs.
- `deleteMany({ where: { id: { in: ids } } })` is idempotent.
- Scraper max-duration 300s with stale-lock detection at 10 min (`src/app/api/scraper/route.ts`).
- Deadline date handling pinned to `America/Chicago`; covered by `src/lib/__tests__/deadline.test.ts`.

**Gaps** — W15 (unbounded description), S9 (calendar bounds test), S10 (client-side debounce on scraper button).

### DevOps / Infrastructure

**Strengths**
- `start.sh` handles Prisma migration failures (reset + retry) before booting Next.
- `railway.toml` + standalone build wiring is correct.
- Env validation is lazy (per getter) so Next build doesn't require secrets.
- Graceful degradation: missing optional API keys (SAM.gov, Brave, SerpAPI, Airtable, Anthropic) cause scrapers to skip, not crash. `Promise.allSettled` on scraper fan-out isolates failures.
- CSRF + rate-limit + request-id threading all handled in middleware with sensible cleanup.

**Gaps** — Critical #11 (IP header trust), W16 (finish console.log migration), W17 (no Sentry), W18 (shallow health check), S12 (no secret-rotation runbook).

### Data Privacy

**Strengths**
- Public users browse anonymously; no analytics, no cookies, no tracking beacons.
- Admin passwords stored as bcrypt hashes (cost 12); never logged.
- JWTs in `HttpOnly; Secure; SameSite=Lax` cookies, with `tokenVersion` revocation checked per request.
- API responses never leak `passwordHash` or `tokenVersion`.

**Gaps** — Critical #1 (invite token in URL), W19 (admin email retention), W20 (PDF PII to Anthropic), W21 (no retention policy), S13 (privacy/terms page), S14 (GDPR/CCPA self-serve), S15 (`rawData` shape).

## Score Summary

| Category | Score (1-10) | Notes |
|----------|--------------|-------|
| Security | 7 | Strong fundamentals (JWT, bcrypt, CSRF, timing-safe, parameterized SQL). Loses points for invite-token-in-URL, SSRF gaps in page/URL-health helpers, `unsafe-inline` CSP, URL validation missing on admin grant writes. |
| Business Fit | 9 | Product does what the README promises; filters match the data model; status transitions are well-considered. Minor feature-creep risk. |
| UX / Accessibility | 6 | Good foundation (semantic HTML, focus rings, skip link, responsive). Modal/drawer focus traps, live-region announcements, and form guidance need work before shipping to a non-technical audience. |
| Performance | 6 | Schema is indexed sensibly and responses are paginated, but the scraper change-detection loop is serial, `count()` runs on every list request, and AI passes don't run in parallel. Solid wins available. |
| QA / Robustness | 8 | Good test coverage for auth, deadlines, filters, URL utils. Clamping and validation are thoughtful. Missing a description-length cap. |
| DevOps | 7 | Railway deploy is clean, migrations are safe, graceful degradation is real. Needs error tracking, finished logging migration, deeper health check, documented IP-header trust. |
| Data Privacy | 6 | Public users are well-protected. Admin flow has one critical leak (invite token in URL), no retention policy, and no documented third-party processing. |
| **Overall** | **7** | Shippable with a focused critical-issues sprint; post-launch work should tackle the accessibility and performance warnings. |
