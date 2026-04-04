import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const year = Number.parseInt(params.get("year") || new Date().getFullYear().toString());
    const month = Number.parseInt(params.get("month") || (new Date().getMonth() + 1).toString());

    if (
      Number.isNaN(year) ||
      Number.isNaN(month) ||
      month < 1 ||
      month > 12 ||
      year < 2000 ||
      year > 2100
    ) {
      return NextResponse.json({ error: "Invalid year or month parameter" }, { status: 400 });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const grants = await prisma.grant.findMany({
      where: {
        deadline: {
          gte: startDate,
          lte: endDate,
        },
        status: "OPEN",
      },
      select: {
        id: true,
        title: true,
        deadline: true,
        grantType: true,
        amount: true,
        sourceName: true,
      },
      orderBy: { deadline: "asc" },
    });

    // Group by date
    const grouped: Record<string, typeof grants> = {};
    for (const grant of grants) {
      if (grant.deadline) {
        const key = grant.deadline.toISOString().split("T")[0];
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(grant);
      }
    }

    const response = NextResponse.json({ year, month, grants: grouped });
    response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return response;
  } catch (error) {
    logError("calendar-api", "Failed to fetch calendar grants", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
