import { NextRequest, NextResponse } from "next/server";
import { runFullScrape } from "@/lib/scrapers";

export async function POST(request: NextRequest) {
  // Protect the endpoint with a secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runFullScrape();

    const summary = results.map((r) => ({
      source: r.source,
      grantsFound: r.grants.length,
      error: r.error || null,
    }));

    return NextResponse.json({
      success: true,
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[scraper-api] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
