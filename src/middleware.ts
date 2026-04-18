import { NextRequest, NextResponse } from "next/server";

// In-memory rate limiter. Sufficient for single-instance Railway deployment.
// Resets on deploy/restart. Does NOT work across multiple instances.
// NOTE: If scaling to multiple instances, migrate to Redis-backed rate limiting
// (e.g. @upstash/ratelimit or ioredis with a sliding window) to prevent
// per-instance burst amplification.
const RATE_LIMITS: Record<string, { windowMs: number; max: number }> = {
  "/api/auth": { windowMs: 60_000, max: 5 },
  "/api/scraper": { windowMs: 60_000, max: 5 },
  "/api/admin": { windowMs: 60_000, max: 30 },
  "/api/grants": { windowMs: 60_000, max: 60 },
};

const hits = new Map<string, { count: number; resetAt: number }>();
let requestCount = 0;

function cleanup() {
  const now = Date.now();
  const keysToDelete: string[] = [];
  hits.forEach((entry, key) => {
    if (now > entry.resetAt) keysToDelete.push(key);
  });
  keysToDelete.forEach((key) => hits.delete(key));
}

/** Anti-CSRF origin check for state-changing requests. Returns a 403 response on failure, or null if OK. */
function checkCsrfOrigin(request: NextRequest): NextResponse | null {
  const path = request.nextUrl.pathname;
  if (!path.startsWith("/api/") || !["POST", "PUT", "DELETE"].includes(request.method)) {
    return null;
  }
  // Scraper endpoint uses Bearer token auth, not cookies — skip origin check
  if (path === "/api/scraper") {
    return null;
  }
  const origin = request.headers.get("origin");
  if (!origin) {
    return NextResponse.json({ error: "Missing origin header" }, { status: 403 });
  }
  try {
    if (new URL(origin).origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  return null;
}

/**
 * Build the Content-Security-Policy using a per-request nonce for scripts.
 * `style-src` intentionally keeps `'unsafe-inline'` because Tailwind + Next's
 * generated style attributes require it; browsers ignore nonces on style
 * attributes anyway.
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Forward requestId + nonce to downstream handlers and set response headers. */
function nextWithContext(request: NextRequest, requestId: string, nonce: string): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  return response;
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const nonce = crypto.randomUUID().replaceAll("-", "");

  const csrfError = checkCsrfOrigin(request);
  if (csrfError) {
    csrfError.headers.set("Content-Security-Policy", buildCsp(nonce));
    return csrfError;
  }

  // Non-API routes only need the CSP + request-id wiring.
  if (!path.startsWith("/api/")) {
    return nextWithContext(request, requestId, nonce);
  }

  const config = Object.entries(RATE_LIMITS).find(([prefix]) => path.startsWith(prefix));
  if (!config) {
    return nextWithContext(request, requestId, nonce);
  }

  const [, { windowMs, max }] = config;
  // Trust only x-real-ip; Railway's proxy sets it. x-forwarded-for is
  // client-spoofable unless the edge strips it, which we do not guarantee.
  const ip = request.headers.get("x-real-ip") ?? "unknown";
  const [prefix] = config;
  const key = `${ip}:${prefix}`;
  const now = Date.now();

  // Periodic cleanup every 100 requests to prevent unbounded Map growth
  requestCount++;
  if (requestCount % 100 === 0) cleanup();

  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return nextWithContext(request, requestId, nonce);
  }

  entry.count++;
  if (entry.count > max) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)),
          "x-request-id": requestId,
          "Content-Security-Policy": buildCsp(nonce),
        },
      },
    );
  }

  return nextWithContext(request, requestId, nonce);
}

export const config = {
  // Run on all paths except static assets and Next internals so the CSP
  // nonce is attached to every HTML response.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|otf)).*)",
  ],
};
