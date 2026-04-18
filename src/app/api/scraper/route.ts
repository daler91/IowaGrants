import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { runFullScrape } from "@/lib/scrapers";
import { log, logError } from "@/lib/errors";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const maxDuration = 300; // 5 minute timeout for this route

const STALE_LOCK_MS = 10 * 60 * 1000; // 10 minutes
const RECENT_RUNS_LIMIT = 10;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }

  const recent = await prisma.scrapeRun.findMany({
    orderBy: { startedAt: "desc" },
    take: RECENT_RUNS_LIMIT,
  });
  return NextResponse.json({ scrape: recent[0] ?? null, recent });
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = env.CRON_SECRET;

  const hasCronSecret = Boolean(
    cronSecret && authHeader && safeCompare(authHeader, `Bearer ${cronSecret}`),
  );

  let adminEmail: string | null = null;
  if (!hasCronSecret) {
    try {
      const admin = await requireAdmin(request);
      adminEmail = admin.email;
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      throw err;
    }
  }

  // Check for an already-running scrape
  const running = await prisma.scrapeRun.findFirst({
    where: { status: "running" },
    orderBy: { startedAt: "desc" },
  });

  if (running) {
    const age = Date.now() - running.startedAt.getTime();
    if (age < STALE_LOCK_MS) {
      return NextResponse.json(
        { error: "Scrape already in progress", scrapeId: running.id },
        { status: 409 },
      );
    }
    // Stale lock — mark as failed
    await prisma.scrapeRun.update({
      where: { id: running.id },
      data: { status: "failed", error: "Timed out (stale lock)", completedAt: new Date() },
    });
  }

  // Create a new scrape run record
  const scrapeRun = await prisma.scrapeRun.create({ data: {} });

  if (adminEmail) {
    log("admin-audit", "Scrape triggered by admin", {
      admin: adminEmail,
      scrapeId: scrapeRun.id,
    });
  }

  // Run scraper in the background — wrap the entire chain so that errors
  // inside .then() (e.g. a failed DB update) don't become unhandled rejections.
  runFullScrape(scrapeRun.id)
    .then(async (results) => {
      const grantsFound = results.reduce((sum, r) => sum + r.grants.length, 0);
      const summary = results.map((r) => ({
        source: r.source,
        grantsFound: r.grants.length,
        error: r.error || null,
      }));
      log("scraper-api", "Scrape completed", { summary });
      await prisma.scrapeRun.update({
        where: { id: scrapeRun.id },
        data: { status: "completed", completedAt: new Date(), grantsFound },
      });
    })
    .catch(async (error) => {
      logError("scraper-api", "Scrape failed", error);
      try {
        await prisma.scrapeRun.update({
          where: { id: scrapeRun.id },
          data: {
            status: "failed",
            completedAt: new Date(),
            error: (error instanceof Error ? error.message : "Unknown error").slice(0, 500),
          },
        });
      } catch (updateError) {
        logError("scraper-api", "Failed to update scrape run status after failure", updateError);
      }
    });

  return NextResponse.json({
    success: true,
    scrapeId: scrapeRun.id,
    message: "Scrape started. Use GET /api/scraper to check status.",
    timestamp: new Date().toISOString(),
  });
}
