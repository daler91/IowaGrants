import { NextRequest, NextResponse } from "next/server";

// In-memory rate limiter. Sufficient for single-instance Railway deployment.
// Resets on deploy/restart. Does NOT work across multiple instances.
// NOTE: If scaling to multiple instances, migrate to Redis-backed rate limiting
// (e.g. @upstash/ratelimit or ioredis with a sliding window) to prevent
// per-instance burst amplification.
const RATE_LIMITS: Record<string, { windowMs: number; max: number }> = {
  "/api/auth": { windowMs: 60_000, max: 10 },
  "/api/scraper": { windowMs: 60_000, max: 5 },
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

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // ── Anti-CSRF origin check for state-changing requests ──────────────
  if (
    path.startsWith("/api/") &&
    ["POST", "PUT", "DELETE"].includes(request.method)
  ) {
    const origin = request.headers.get("origin");
    if (origin) {
      try {
        if (new URL(origin).origin !== request.nextUrl.origin) {
          return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
      }
    }
  }

  // ── Propagate request ID for correlated logging ─────────────────────
  const requestId =
    request.headers.get("x-request-id") || crypto.randomUUID();

  const config = Object.entries(RATE_LIMITS).find(([prefix]) =>
    path.startsWith(prefix)
  );
  if (!config) {
    const response = NextResponse.next();
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const [, { windowMs, max }] = config;
  // Use first x-forwarded-for entry (set by reverse proxy / Railway edge).
  // Rightmost is less reliable (can be spoofed in multi-hop setups).
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const [prefix] = config;
  const key = `${ip}:${prefix}`;
  const now = Date.now();

  // Periodic cleanup every 100 requests to prevent unbounded Map growth
  requestCount++;
  if (requestCount % 100 === 0) cleanup();

  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    const response = NextResponse.next();
    response.headers.set("x-request-id", requestId);
    return response;
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
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
