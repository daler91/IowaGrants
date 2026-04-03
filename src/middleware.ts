import { NextRequest, NextResponse } from "next/server";

// In-memory rate limiter. Sufficient for single-instance Railway deployment.
// Resets on deploy/restart. Does not work across multiple instances.
const RATE_LIMITS: Record<string, { windowMs: number; max: number }> = {
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
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `${ip}:${path}`;
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
  matcher: ["/api/scraper/:path*", "/api/grants/:path*"],
};
