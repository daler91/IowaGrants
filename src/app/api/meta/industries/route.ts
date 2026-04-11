import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { errorResponse, logError } from "@/lib/errors";

/**
 * Distinct industry values across all grants. Same pattern as
 * /api/meta/locations — see that route for the cache-header rationale.
 */
export async function GET(request: NextRequest) {
  try {
    const rows = await prisma.$queryRaw<{ value: string }[]>(Prisma.sql`
      SELECT DISTINCT unnest(industries) AS value
      FROM "Grant"
      WHERE array_length(industries, 1) > 0
      ORDER BY value ASC
    `);

    const industries = rows
      .map((r) => r.value)
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    const response = NextResponse.json({ industries });
    response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return response;
  } catch (error) {
    logError("meta-api", "Failed to load distinct industries", error);
    return errorResponse(request, 500, "Failed to load industries");
  }
}
