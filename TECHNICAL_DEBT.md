# Technical Debt Report

**Generated:** 2026-04-04  
**Codebase:** IowaGrants (Next.js 14 / TypeScript / Prisma / PostgreSQL)

This document catalogs known technical debt in the IowaGrants application, organized by severity. Each item includes affected files, a description of the issue, and a recommended action.

---

## Critical

### 1. Test Coverage (~5%)

Only 3 test files exist out of ~60 production source files.

**Existing tests:**
- `src/lib/ai/__tests__/categorizer.test.ts` — grant categorization logic
- `src/lib/scrapers/__tests__/article-grants.test.ts` — `extractAmountFromText()` only
- `src/lib/scrapers/__tests__/utils.test.ts` — utility functions (deadline extraction, title normalization, etc.)

**Untested areas (zero coverage):**
- **API routes** — `src/app/api/grants/route.ts`, `src/app/api/grants/[id]/route.ts`, `src/app/api/scraper/route.ts`, all `src/app/api/auth/*`, all `src/app/api/admin/*`
- **Authentication** — `src/lib/auth.ts` (JWT validation, admin verification, token refresh)
- **React components** — `src/components/GrantList.tsx`, `src/components/GrantCard.tsx`, `src/components/GrantFilters.tsx`, `src/components/SearchBar.tsx`
- **Admin pages** — all files under `src/app/admin/`
- **AI features** — `src/lib/ai/pdf-parser.ts`, `src/lib/ai/grant-validator.ts`
- **Scrapers** — 10+ scraper modules in `src/lib/scrapers/` (only article-grants has partial coverage)
- **Change detection** — `src/lib/change-detection/detector.ts`
- **Middleware** — `src/middleware.ts` (rate limiting logic)

No integration tests or end-to-end tests exist.

**Action:** Add a CI test pipeline. Prioritize tests for API routes, auth flows, and the scraper orchestrator (`src/lib/scrapers/index.ts`).

---

### 2. CI/CD Gaps

Only one workflow exists: `.github/workflows/sonarcloud.yml` (SonarCloud static analysis).

**Missing pipelines:**
- Test execution (`npm run test` never runs in CI)
- Build verification (`npm run build` never runs in CI)
- Lint enforcement (ESLint exists but is not enforced in CI)
- Automated deployment (Railway deployment is manual)
- Security scanning (no dependency vulnerability checks, no secret scanning)
- Pre-commit hooks (no Husky/lint-staged)

**Action:** Add GitHub Actions workflows for test, build, and lint. Add Husky with lint-staged for pre-commit enforcement.

---

### 3. Fail-Open AI Validation

**File:** `src/lib/ai/grant-validator.ts` (lines 93–106)

When the Claude API call fails, the catch block assumes **all grants are valid**:

```typescript
// On failure, assume all grants are valid (fail-open)
return grants.map((_, i) => ({
  is_real_grant: true,
  small_biz_eligible: true,
  confidence: "MEDIUM",
  reason: "Validation failed, assuming valid",
}));
```

This means an API outage silently disables grant validation, allowing invalid or non-grant content through.

**Action:** Implement retry with exponential backoff. On persistent failure, either fail closed (reject the batch) or fall back to rule-based heuristic validation.

---

## High

### 4. Error Handling & Logging

**Scope:** 111+ `console.log`/`console.error` calls across 26 files with inconsistent patterns.

**Issues:**
- **Generic catch blocks** — no distinction between network timeout, rate limit (429), auth error (401), or server error (500). All errors treated identically. Found in: all API routes, `src/lib/scrapers/*.ts`, `src/lib/ai/*.ts`.
- **Inconsistent prefixes** — some files use `[orchestrator]`, `[pdf-parser]`, `[sam.gov]`; others use no prefix at all.
- **Inconsistent error extraction** — mix of `error instanceof Error ? error.message : error`, `error instanceof Error ? error.message : "Unknown error"`, and `result.reason?.message || "Unknown error"`.
- **Error truncation** — `src/app/api/scraper/route.ts` line 83 truncates error messages with `.slice(0, 500)`, potentially losing critical diagnostic info.
- **Inconsistent API response formats** — `/api/auth/login` returns `{ error, success, admin }`, `/api/grants` returns `{ data, total, page }`, `/api/admin/blacklist` returns `{ created, duplicates }`. No standardized response envelope.
- **No error tracking** — no Sentry or equivalent configured.

**Action:** Create shared error utilities for categorized error handling. Adopt a structured logger (Pino or Winston). Standardize API response format. Consider adding Sentry for production error tracking.

---

### 5. God Files / Large Modules

Several files have grown too large with mixed responsibilities:

| File | Lines | Responsibilities |
|------|-------|-----------------|
| `src/lib/scrapers/article-grants.ts` | 904 | URL config, HTML parsing, field extraction, deduplication, multiple parsing strategies |
| `src/lib/scrapers/utils.ts` | 735 | 18 exported functions: HTML cleaning, URL validation, deadline extraction, grant filtering, amount parsing, location detection, etc. |
| `src/lib/scrapers/airtable-grants.ts` | 539 | Airtable API fetching, shared view scraping, record transformation, field parsing |
| `src/app/admin/grants/[id]/edit/page.tsx` | 532 | Form state, validation, API communication all in one component |
| `src/lib/scrapers/web-search.ts` | 475 | Web search integration and parsing |
| `src/lib/scrapers/index.ts` | 371 | Orchestration, deduplication, and filtering (`runFullScrape()` alone is 123 lines) |

**Action:** Split `utils.ts` into focused modules (e.g., `url-utils.ts`, `parsing-utils.ts`, `grant-filters.ts`, `dedup-utils.ts`). Extract form logic in the edit page into custom hooks. Break down `article-grants.ts` by separating URL config, parsing strategies, and extraction logic.

---

### 6. Environment Variable Management

**File:** `src/lib/env.ts`

The centralized env module only validates 3 of 9+ environment variables. The rest are accessed directly via `process.env` throughout the codebase:

- `src/app/api/scraper/route.ts` line 30 — `process.env.CRON_SECRET`
- `src/lib/auth.ts` lines 76, 86 — `process.env.NODE_ENV`
- `src/instrumentation.ts` — `process.env.ADMIN_EMAIL`, `process.env.ADMIN_PASSWORD`, `process.env.NEXT_RUNTIME`

Missing validation means environment errors only surface at runtime when a specific code path is hit.

**Action:** Centralize all env access through `src/lib/env.ts` with eager validation at startup for all required variables (`ANTHROPIC_API_KEY`, `SAM_GOV_API_KEY`, `SIMPLER_GRANTS_API_KEY`, `CRON_SECRET`, `JWT_SECRET`, etc.).

---

## Medium

### 7. Code Duplication

**Validation constants** duplicated in three files:
- `src/app/api/grants/route.ts` lines 6–9
- `src/app/api/grants/[id]/route.ts` lines 6–9
- `src/app/admin/grants/[id]/edit/page.tsx` lines 7–10

All define identical arrays: `VALID_GRANT_TYPES`, `VALID_GENDER_FOCUS`, `VALID_BUSINESS_STAGE`, `VALID_GRANT_STATUS`.

**Browser User-Agent headers** duplicated with slight variations across 7 scraper files:
- `src/lib/scrapers/article-grants.ts` lines 302–318
- `src/lib/scrapers/iowa-local-grants.ts` lines 133–144
- `src/lib/scrapers/web-search.ts` line 303
- `src/lib/scrapers/usda-iowa.ts` line 30
- `src/lib/scrapers/airtable-grants.ts` line 269
- (and others)

**Pagination/numeric parsing** uses inconsistent approaches:
- `src/app/api/grants/route.ts` — `Number.parseInt()`
- `src/app/api/admin/blacklist/route.ts` — `Number()`
- `src/app/api/grants/calendar/route.ts` — yet another variant

**Repetitive filter chains** in `src/lib/scrapers/index.ts` lines 305–343 — three sequential `.filter()` calls with identical text-concatenation pattern that could be a single pass.

**Action:** Extract shared constants to `src/lib/constants/`. Create a shared HTTP headers module. Create a pagination parameter parsing utility. Consolidate filter chains into a single pass with multiple predicates.

---

### 8. Type Safety Issues

- **`any` type** — `src/lib/scrapers/article-grants.ts` line 623: `const sectionElements: any[] = []`
- **Unsafe casts** — `src/app/grants/[id]/page.tsx` line 216 casts `rawData` as `Record<string, unknown>` without validation, then further casts nested fields
- **No schema validation on AI responses** — `src/lib/ai/pdf-parser.ts` lines 136–137: `JSON.parse(textContent.text)` trusted without shape validation. Claude may return malformed data.
- **Awkward return type** — `requireAdmin()` in `src/lib/auth.ts` returns `AdminUser | NextResponse`. Every caller must check `if (admin instanceof NextResponse) return admin;` — easy to forget and error-prone.

**Action:** Add Zod schemas to validate Claude API responses and `rawData` shape. Replace `any` with proper types. Refactor `requireAdmin()` to throw an error (caught by middleware) instead of returning a response.

---

### 9. Database Concerns

**N+1 pattern** — `src/lib/change-detection/detector.ts` lines 18–78: fetches all monitored URLs with `findMany()` (no pagination), then runs individual `prisma.monitoredUrl.update()` calls in a loop.

**Missing indexes:**
- No index on `sourceName` in `prisma/schema.prisma` despite being used in `findExistingGrant` queries
- No unique constraint on `Category.name` or `EligibleExpense.name` (lines 45–54), allowing duplicate entries

**Untyped JSON** — `prisma/schema.prisma` line 28: `rawData Json?` has no documented or validated structure. Used in `src/lib/ai/pdf-parser.ts` and multiple scrapers without type safety.

**Action:** Batch the update loop in change detection. Add database index on `sourceName`. Add unique constraints on category/expense names. Define and document the expected `rawData` shape.

---

### 10. Security

**In-memory rate limiter** — `src/middleware.ts` lines 3–9:
- Cleanup only runs every 100 requests; potential unbounded memory growth
- Single-instance only — won't work if scaled to multiple Railway instances
- `x-forwarded-for` header used for IP identification with minimal validation (`.split(",").pop()`)

**CSP header** — `next.config.mjs` lines 24–26: `connect-src 'self'` may block Anthropic SDK calls to `api.anthropic.com`. Should include `connect-src 'self' https://api.anthropic.com`.

**No password strength validation** — `prisma/seed.ts` line 15 accepts `ADMIN_PASSWORD` from env without length/complexity requirements.

**Action:** Fix CSP header to allow Anthropic API. Add password strength validation. Document rate limiter as single-instance only, and plan for distributed rate limiting if scaling.

---

### 11. Magic Numbers / Hardcoded Config

Timeout and delay values scattered as raw numbers:
- `30000` ms — `src/lib/ai/pdf-parser.ts` (PDF fetch timeout)
- `10000` ms — `src/lib/scrapers/utils.ts` line 167
- `20000` ms — various scrapers
- `1000`–`2000` ms — polite delays in `src/lib/scrapers/article-grants.ts` lines 874–876, `src/lib/scrapers/iowa-local-grants.ts` lines 243, 293
- `2000` ms — Google Cache retry delay in `article-grants.ts` line 348

Rate limits hardcoded in `src/middleware.ts` lines 14–16:
```typescript
"/api/auth": { windowMs: 60_000, max: 10 },
"/api/scraper": { windowMs: 60_000, max: 5 },
"/api/grants": { windowMs: 60_000, max: 60 },
```

30+ hardcoded article source URLs in `src/lib/scrapers/article-grants.ts` lines 28–296.

**Action:** Extract timeouts/delays to named constants in a shared config. Move article source URLs to a configurable data file.

---

## Low

### 12. Performance

- **No `React.memo`** on `GrantCard` rendered in lists via `.map()` — `src/components/GrantList.tsx` lines 157–166
- **12 concurrent scrapers** via `Promise.allSettled` in `src/lib/scrapers/index.ts` line 259 — no rate limiting between sources
- **Sequential PDF parsing** — `src/lib/scrapers/index.ts` lines 189–202: each PDF triggers an individual Anthropic API call with no batching
- **`axios` dependency** — used throughout scrapers where native `fetch` (available in Node 18+) would suffice, reducing bundle size
- **No bundle analysis** — no webpack-bundle-analyzer or similar configured

**Action:** Add `React.memo` to `GrantCard`. Consider batch PDF processing. Evaluate migrating from `axios` to native `fetch`. Add bundle analysis tooling.

---

### 13. Documentation

- **Zero JSDoc comments** in the entire codebase
- **No API documentation** — no OpenAPI/Swagger spec; API query parameters only loosely described in README
- **No architecture docs** — complex scraper orchestration pipeline (`src/lib/scrapers/index.ts`) undocumented
- **No developer guide** — no "how to add a new scraper" instructions
- **Complex regex patterns** undocumented — e.g., `EDUCATIONAL_PATTERNS` (article-grants.ts lines 520–526), `NON_SMALL_BIZ_PATTERNS` (utils.ts lines 322–370)

**Action:** Add JSDoc to complex/public functions. Create a brief architecture overview. Document the scraper addition process.

---

### 14. Developer Tooling

- **No Prettier** — no `.prettierrc` or `prettier.config.*`, leading to inconsistent formatting
- **Minimal ESLint** — `.eslintrc.json` only extends `next/core-web-vitals` and `next/typescript` with no custom rules
- **No `.editorconfig`** — editor settings not unified across contributors
- **No `.nvmrc`** — Node version not pinned
- **No Docker config** — deployment relies on Railway-specific setup in `start.sh`

**Action:** Add Prettier with lint-staged. Add `.editorconfig` and `.nvmrc`. Consider adding a Dockerfile for local development parity.
