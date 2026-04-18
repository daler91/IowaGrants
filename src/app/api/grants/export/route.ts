import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { GRANT_INCLUDE_DETAIL } from "@/lib/constants";
import { buildGrantWhere } from "@/lib/grant-query";
import { logError } from "@/lib/errors";

const EXPORT_MAX = 1000;

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const where = buildGrantWhere(params);

    const [grants, total] = await Promise.all([
      prisma.grant.findMany({
        where,
        include: GRANT_INCLUDE_DETAIL,
        orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
        take: EXPORT_MAX,
      }),
      prisma.grant.count({ where }),
    ]);

    return NextResponse.json({
      data: grants,
      total,
      truncated: total > EXPORT_MAX,
      limit: EXPORT_MAX,
    });
  } catch (error) {
    logError("grants-export-api", "Failed to export grants", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
