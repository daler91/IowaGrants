import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { runFullScrape } from "@/lib/scrapers";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const maxDuration = 300; // 5 minute timeout for this route

const STALE_LOCK_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const latest = await prisma.scrapeRun.findFirst({
    orderBy: { startedAt: "desc" },
  });
  return NextResponse.json({ scrape: latest });
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  const expected = `Bearer ${cronSecret}`;
  if (!cronSecret || !safeCompare(authHeader || "", expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        { status: 409 }
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

  // Run scraper in the background
  runFullScrape(scrapeRun.id)
    .then(async (results) => {
      const grantsFound = results.reduce((sum, r) => sum + r.grants.length, 0);
      const summary = results.map((r) => ({
        source: r.source,
        grantsFound: r.grants.length,
        error: r.error || null,
      }));
      console.log("[scraper-api] Scrape completed:", JSON.stringify(summary));
      await prisma.scrapeRun.update({
        where: { id: scrapeRun.id },
        data: { status: "completed", completedAt: new Date(), grantsFound },
      });
    })
    .catch(async (error) => {
      console.error("[scraper-api] Scrape failed:", error);
      await prisma.scrapeRun.update({
        where: { id: scrapeRun.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          error: (error instanceof Error ? error.message : "Unknown error").slice(0, 500),
        },
      });
    });

  return NextResponse.json({
    success: true,
    scrapeId: scrapeRun.id,
    message: "Scrape started. Use GET /api/scraper to check status.",
    timestamp: new Date().toISOString(),
  });
}
