# IowaGrants Codebase Audit (April 6, 2026)

## Architecture & Design Patterns

### [Medium] API response-shape and validation logic is repeated across routes

**File/Location:** `src/app/api/auth/login/route.ts`, `src/app/api/admin/register/route.ts`, `src/app/api/grants/[id]/route.ts`

**The Issue:** Each route hand-rolls JSON parsing and validation. This causes drift in error contracts, repetitive code paths, and higher bug surface.

**The Fix:** Introduce shared Zod schemas and a common request parser helper.

```ts
// src/lib/http/parse-json.ts
import { NextRequest, NextResponse } from "next/server";
import { ZodSchema } from "zod";

export async function parseJson<T>(request: NextRequest, schema: ZodSchema<T>) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { error: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      error: NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      ),
    };
  }

  return { data: parsed.data };
}
```

### [Low] Deprecated auth wrapper still used in active routes

**File/Location:** `src/lib/auth.ts`, `src/app/api/admin/invites/route.ts`, `src/app/api/admin/blacklist/route.ts`, `src/app/api/grants/route.ts`

**The Issue:** `requireAdminOrResponse` is marked deprecated but remains in production paths, creating mixed auth patterns and inconsistent error handling.

**The Fix:** Standardize on `requireAdmin` + centralized error mapping middleware/helper.

```ts
try {
  const admin = await requireAdmin(request);
  // route logic
} catch (err) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  throw err;
}
```

## Security & Vulnerabilities

### [High] Invite token is transported in URL query params

**File/Location:** `src/app/admin/invites/page.tsx`, `src/app/register/page.tsx`

**The Issue:** The raw invite token is placed in `?token=` links. Query tokens leak via browser history, logs, analytics, and `Referer` headers.

**The Fix:** Deliver token out-of-band and submit via POST body or URL fragment (`#token=`) never sent to server logs by default.

```ts
// safer client flow (fragment-based)
const link = `${window.location.origin}/register#token=${data.invite.token}`;

// register page
const token =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token")
    : null;
```

### [High] Rate limiting key trusts spoofable forwarding headers

**File/Location:** `src/middleware.ts`

**The Issue:** Rate limiting uses `x-forwarded-for`/`x-real-ip` directly. Attackers can spoof these headers and evade throttles.

**The Fix:** Prefer trusted runtime IP (e.g., `request.ip`) or platform-authenticated header, and validate format.

```ts
const ip = request.ip ?? "unknown";
// If platform requires header parsing, only trust known edge header injected by infrastructure.
```

### [Medium] JWT verification lacks issuer/audience constraints

**File/Location:** `src/lib/auth.ts`

**The Issue:** Token verification checks signature but does not enforce `iss`/`aud`. This weakens boundary checks when secrets are reused across services.

**The Fix:** Set and verify issuer/audience explicitly.

```ts
// sign
new SignJWT(payload)
  .setProtectedHeader({ alg: "HS256" })
  .setIssuer("iowagrants-admin")
  .setAudience("iowagrants-web")
  .setIssuedAt()
  .setExpirationTime("7d");

// verify
await jwtVerify(token, getSecret(), {
  issuer: "iowagrants-admin",
  audience: "iowagrants-web",
});
```

### [Medium] Missing anti-CSRF defense for cookie-authenticated state-changing endpoints

**File/Location:** `src/app/api/admin/*`, `src/app/api/grants/route.ts` (DELETE)

**The Issue:** Stateful endpoints depend only on cookie auth. `SameSite=Lax` helps, but explicit CSRF tokens/origin checks are still recommended for admin-grade actions.

**The Fix:** Enforce `Origin` check + per-session CSRF token for POST/PUT/DELETE.

```ts
const origin = request.headers.get("origin");
if (!origin || new URL(origin).origin !== process.env.APP_ORIGIN) {
  return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
}
```

## Performance & Optimization

### [Medium] Sequential I/O in scrape pipeline increases wall-clock time

**File/Location:** `src/lib/scrapers/index.ts` (`processPdfGrants`)

**The Issue:** PDF reparsing loops are sequential (`for` + `await`). For many PDFs this grows linearly and risks timeout.

**The Fix:** Use bounded concurrency (e.g., 3–5 workers) to reduce total runtime safely.

```ts
import pLimit from "p-limit";

const limit = pLimit(4);
await Promise.all(
  urlsToReparse
    .filter((u) => u.endsWith(".pdf"))
    .map((url) =>
      limit(async () => {
        const parsed = await parsePdfFromUrl(url, "pdf-parse");
        if (parsed) allGrants.push(parsed);
        await markReparsed(url);
      }),
    ),
);
```

### [Low] In-memory rate limiter does not scale horizontally

**File/Location:** `src/middleware.ts`

**The Issue:** Current limiter state is process-local. Multi-instance deployments will permit per-instance burst amplification.

**The Fix:** Move to Redis-backed global limiter with sliding window.

```ts
// pseudo-code using Redis key: rate:${ip}:${route}
// increment atomically, set TTL on first hit, reject > max
```

## Maintainability & Scalability

### [Medium] Dashboard has duplicated query-param composition in multiple branches

**File/Location:** `src/app/page.tsx`

**The Issue:** URL param serialization is repeated in fetch, router sync, and export generation. Feature additions will require edits in multiple places.

**The Fix:** Extract a single `buildGrantQueryParams(filters, search)` helper used everywhere.

```ts
function buildGrantQueryParams(filters: FilterType, search: string): URLSearchParams {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  // ...single canonical mapping
  return params;
}
```

### [Low] Logging strategy is not request-correlated

**File/Location:** `src/lib/errors.ts`, API routes

**The Issue:** Logs are structured JSON, but lack request IDs/trace IDs, making incident triage difficult.

**The Fix:** Add `requestId` propagation from middleware to route logs.

```ts
log("grants-api", "Failed to fetch grants", {
  requestId: request.headers.get("x-request-id"),
  path: request.nextUrl.pathname,
});
```

## External Integrations

### [Medium] External API fallbacks are present, but no global budget/circuit-breaker

**File/Location:** `src/lib/scrapers/web-search.ts`, `src/lib/ai/description-generator.ts`, `src/lib/ai/deadline-extractor.ts`

**The Issue:** Retry loops and provider fallbacks exist, but there is no global “stop spending” budget, breaker state, or per-run cap across providers.

**The Fix:** Add a per-run integration budget manager and short-circuit when exhausted.

```ts
class IntegrationBudget {
  private aiCalls = 0;
  constructor(private readonly maxAiCalls: number) {}
  canCallAI() {
    return this.aiCalls < this.maxAiCalls;
  }
  recordAICall() {
    this.aiCalls++;
  }
}
```

### [Low] Anthropic client construction is eager module-level

**File/Location:** `src/lib/ai/pdf-parser.ts`, `src/lib/ai/description-generator.ts`, `src/lib/ai/deadline-extractor.ts`

**The Issue:** Client is instantiated at import time. This can complicate test setup and environment bootstrapping.

**The Fix:** Lazy-init client only when needed.

```ts
let anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return anthropic;
}
```
