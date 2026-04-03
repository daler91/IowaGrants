import { NextRequest, NextResponse } from "next/server";
import { runFullScrape } from "@/lib/scrapers";

export const maxDuration = 300; // 5 minute timeout for this route

export async function POST(request: NextRequest) {
  // Protect the endpoint with a secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Run scraper in the background so we don't hit gateway timeouts
  const scrapePromise = runFullScrape()
    .then((results) => {
      const summary = results.map((r) => ({
        source: r.source,
        grantsFound: r.grants.length,
        error: r.error || null,
      }));
      console.log("[scraper-api] Scrape completed:", JSON.stringify(summary));
    })
    .catch((error) => {
      console.error("[scraper-api] Scrape failed:", error);
    });

  // Keep the promise alive so it doesn't get garbage collected
  if (typeof globalThis !== "undefined") {
    (globalThis as Record<string, unknown>).__scrapePromise = scrapePromise;
  }

  return NextResponse.json({
    success: true,
    message: "Scrape started in background. Check /api/grants for results or Railway logs for progress.",
    timestamp: new Date().toISOString(),
  });
}
