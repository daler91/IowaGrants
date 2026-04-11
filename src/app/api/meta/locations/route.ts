import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { errorResponse, logError } from "@/lib/errors";

/**
 * Distinct location values across all grants. Fed to the Location combobox
 * in the dashboard filter sidebar. Locations are stored as a `String[]`
 * column, so we need `unnest` to flatten them before DISTINCT.
 *
 * Cached for 5 minutes (stale-while-revalidate 1h) — the set changes only
 * when scraped data lands, which is measured in hours.
 */
export async function GET(request: NextRequest) {
  try {
    const rows = await prisma.$queryRaw<{ value: string }[]>(Prisma.sql`
      SELECT DISTINCT unnest(locations) AS value
      FROM "Grant"
      WHERE array_length(locations, 1) > 0
      ORDER BY value ASC
    `);

    const locations = rows
      .map((r) => r.value)
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    const response = NextResponse.json({ locations });
    response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return response;
  } catch (error) {
    logError("meta-api", "Failed to load distinct locations", error);
    return errorResponse(request, 500, "Failed to load locations");
  }
}
