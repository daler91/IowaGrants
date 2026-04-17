# Technical Debt Report

**Generated:** 2026-04-04  
**Last updated:** 2026-04-04  
**Codebase:** IowaGrants (Next.js 14 / TypeScript / Prisma / PostgreSQL)

This document catalogs known technical debt in the IowaGrants application, organized by severity. Items marked with **[RESOLVED]** have been addressed. Items marked with **[PARTIAL]** have been partially addressed with remaining work noted.

---

## Critical

### 1. Test Coverage [PARTIAL]

**Before:** 3 test files, 80 tests (~5% coverage).  
**After:** 9 test files, 126 tests (~15% coverage).

**Added tests:**

- `src/lib/__tests__/auth.test.ts` — password hashing, JWT sign/verify, UnauthorizedError
- `src/lib/__tests__/env.test.ts` — required var validation, optional vars, isProduction
- `src/lib/__tests__/errors.test.ts` — getErrorMessage for various types
- `src/lib/scrapers/__tests__/url-utils.test.ts` — SSRF blocking, URL sanitization, homepage detection
- `src/lib/scrapers/__tests__/grant-filters.test.ts` — state restrictions, eligibility, content detection
- `src/lib/scrapers/__tests__/page-utils.test.ts` — error page detection, grant page validation

**Still untested:**

- API routes (GET/POST/PUT/DELETE handlers)
- React components and admin pages
- AI features (`pdf-parser.ts`, `grant-validator.ts`)
- Individual scraper modules (10+ files)
- Change detection, middleware

**Remaining action:** Add API route integration tests, component tests, and scraper unit tests.

---

### 2. CI/CD Gaps [RESOLVED]

Added `.github/workflows/ci.yml` with four jobs: lint, typecheck, test, and build (build depends on the other three passing).

**Still missing:** Automated deployment, security scanning (dependency audit), pre-commit hooks (Husky/lint-staged).

---

### 3. Fail-Open AI Validation [RESOLVED]

`src/lib/ai/grant-validator.ts` now implements:

- Retry with exponential backoff (3 attempts, 1s/2s/4s delays)
- Fail-closed behavior: if all retries fail, the batch is rejected (dropped) instead of assumed valid

---

## High

### 4. Error Handling & Logging [RESOLVED]

**Resolved:**

- Added `src/lib/errors.ts` with `getErrorMessage()`, `log()`, `logError()`, `logWarn()` + `withRequestId()` for standardized structured JSON logging
- Migrated all remaining `console.log/error` calls in app/components code to the structured logger
- ESLint `no-console` enforced as error on server code (only the logger itself may use console)
- Optional Sentry integration wired via `src/instrumentation.ts` + `instrumentation-client.ts` (no-op when `SENTRY_DSN` is unset)

---

### 5. God Files / Large Modules [PARTIAL]

**Resolved:**

- Split `src/lib/scrapers/utils.ts` (735 lines) into 4 focused modules:
  - `url-utils.ts` — SSRF protection, URL safety, homepage detection, URL health check
  - `parsing-utils.ts` — HTML cleaning, deadline extraction, amount parsing, title normalization
  - `grant-filters.ts` — eligibility filters, state restrictions, location detection, content detection
  - `page-utils.ts` — page fetching, error page detection, grant page classification
- `utils.ts` is now a barrel re-export for full backward compatibility
- Consolidated 3 repetitive filter chains in `src/lib/scrapers/index.ts` into a single configurable filter loop

**Still remaining:**

- `src/lib/scrapers/article-grants.ts` (904 lines) — URL config, parsing strategies, extraction logic
- `src/lib/scrapers/airtable-grants.ts` (539 lines) — API client, field mapping, category inference
- `src/app/admin/grants/[id]/edit/page.tsx` (532 lines) — form state + validation + API calls

---

### 6. Environment Variable Management [RESOLVED]

Expanded `src/lib/env.ts` from 3 to 17 variables with lazy validation. Replaced direct `process.env` access in 12 files with centralized `env.*` getters. Variables are categorized as required (throws on missing) or optional (returns undefined).

---

## Medium

### 7. Code Duplication [PARTIAL]

**Resolved:**

- Validation constants extracted to `src/lib/constants.ts` — `VALID_GRANT_TYPES`, `VALID_GENDER_FOCUS`, `VALID_BUSINESS_STAGE`, `VALID_GRANT_STATUS`
- Shared Prisma include object: `GRANT_INCLUDE` in `src/lib/constants.ts`
- Repetitive filter chains consolidated in scraper orchestrator
- Scraper config constants extracted to `src/lib/scrapers/config.ts` (timeouts, delays, User-Agent strings)

**Still remaining:**

- Browser User-Agent headers still duplicated across 7 scraper files (constants exist in `config.ts` but not all call sites updated)
- Pagination/numeric parsing still uses inconsistent approaches across API routes

---

### 8. Type Safety Issues [PARTIAL]

**Resolved:**

- Replaced `any[]` with `AnyNode[]` in `article-grants.ts`
- `requireAdmin()` now throws `UnauthorizedError` instead of returning `NextResponse`. Added `requireAdminOrResponse()` for backward compatibility. Existing callsites migrated.

**Still remaining:**

- Unsafe casts of `rawData` JSON field without validation
- No schema validation on Claude API responses in `pdf-parser.ts`

---

### 9. Database Concerns [RESOLVED]

- Batched N+1 updates in `src/lib/change-detection/detector.ts` via `prisma.$transaction()`
- Added `sourceName` index to Grant model + migration (`20260404100000_add_source_name_index`)

**Still remaining:** Untyped `rawData Json?` field — shape not documented or validated at runtime.

---

### 10. Security [PARTIAL]

**Resolved:**

- Added password strength validation (min 12 chars) in `prisma/seed.ts`, `src/instrumentation.ts`, and now enforced inside `hashPassword()`
- Documented rate limiter as single-instance only with migration guidance
- SSRF guards on `fetchPageDetails` and `checkUrlHealth`; Zod `grantUpdateSchema` refines `sourceUrl` / `pdfUrl` via `validateExternalUrl`
- CSP `'unsafe-inline'` removed from `script-src` — per-request nonce in middleware
- `/api/admin/*` rate-limit bucket added; `x-real-ip` is the only trusted client-IP source
- Logout bumps `tokenVersion` so leaked JWTs die immediately; new `POST /api/admin/security/bump-tokens` rotates globally

**Still remaining:** Multi-instance rate limiter (Redis-backed).

---

### 11. Magic Numbers / Hardcoded Config [PARTIAL]

**Resolved:**

- Created `src/lib/scrapers/config.ts` with named constants: `SCRAPER_TIMEOUT_MS`, `PDF_TIMEOUT_MS`, `CHANGE_DETECTION_TIMEOUT_MS`, `POLITE_DELAY_MS`, `AI_CALL_DELAY_MS`, `VALIDATION_BATCH_SIZE`, `SCRAPER_USER_AGENT`, `BROWSER_USER_AGENT`
- Change detection and grant validator updated to use these constants

**Still remaining:**

- Hardcoded timeouts in individual scraper files not yet migrated
- Rate limit config still hardcoded in middleware
- 30+ article source URLs still hardcoded in `article-grants.ts`

---

## Low

### 12. Performance [PARTIAL]

**Resolved:**

- Added `React.memo` to `GrantCard` component; `GrantList.handleSelectOne` memoized via `useCallback` so memoization isn't defeated
- Change-detection URL probing parallelized via `p-limit(CHANGE_DETECT_CONCURRENCY)`
- Shared AI backoff helper that honors `Retry-After` across deadline-extractor, grant-validator, and description-generator
- Scraper tuning constants (batch size, concurrencies) are env-configurable
- Scraper filter pipeline collapsed to a single-pass `.filter(every)` instead of three sequential passes
- Single-grant GET sets `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`
- `GRANT_INCLUDE` split into `GRANT_INCLUDE_LIST` / `GRANT_INCLUDE_DETAIL` for future list-payload slimming
- `useMetaValues` gains a module-level fetch cache + AbortController
- Grant description capped at 5000 chars at write time
- `IntegrationBudget` tracks input/output tokens in addition to call count

**Still remaining:** PDF batch processing, axios→fetch migration, multi-instance rate limiting.

---

### 13. Documentation

No changes yet. Still needs JSDoc comments, API documentation, architecture overview, and developer guides.

---

### 14. Developer Tooling [PARTIAL]

**Resolved:**

- Added `.nvmrc` (Node 20)
- Added `.editorconfig` (2-space indent, LF, UTF-8, trim trailing whitespace)

**Still remaining:** Prettier config, Husky/lint-staged for pre-commit hooks.

---

## Quarterly scope review

The grant-ingestion surface has grown steadily (shadow API hunting, Airtable
scrapers, article-grant parsing, URL health revalidation, change detection).
Each module is defensible in isolation but collectively risks dilution of
the discovery core. On a quarterly cadence, inspect each of the following
and either promote to a first-class feature with owners and tests, or
deprecate / park behind a feature flag:

- `src/lib/scrapers/article-grants.ts`
- `src/lib/scrapers/airtable-grants.ts`
- `src/lib/scrapers/foundation-grants.ts`
- `src/lib/scrapers/shadow-apis.ts` (if present)
- `src/lib/change-detection/*`
- `src/lib/scrapers/revalidate-existing.ts`

Checklist for each review:

1. Still finding net-new grants? (check ScrapeLog)
2. Test coverage present?
3. Error rate (Sentry) within budget?
4. Still aligned with the "Iowa small business" product brief?

Park the review outcome in this file with a date header, e.g. "Q3 2026 review".
