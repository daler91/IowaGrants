import { NextRequest, NextResponse } from "next/server";

// In-memory rate limiter. Sufficient for single-instance Railway deployment.
// Resets on deploy/restart. Does NOT work across multiple instances.
// If scaling to multiple instances, migrate to Redis-backed rate limiting
// (e.g. @upstash/ratelimit or ioredis with a sliding window).
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
  const config = Object.entries(RATE_LIMITS).find(([prefix]) =>
    path.startsWith(prefix)
  );
  if (!config) return NextResponse.next();

  const [, { windowMs, max }] = config;
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor
    ? forwardedFor.split(",").pop()?.trim() || "unknown"
    : request.headers.get("x-real-ip") || "unknown";
  const [prefix] = config;
  const key = `${ip}:${prefix}`;
  const now = Date.now();

  // Periodic cleanup every 100 requests to prevent unbounded Map growth
  requestCount++;
  if (requestCount % 100 === 0) cleanup();

  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return NextResponse.next();
  }

  entry.count++;
  if (entry.count > max) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)),
        },
      }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/:path*", "/api/scraper/:path*", "/api/grants/:path*"],
};
