import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminOrResponse } from "@/lib/auth";
import { GRANT_INCLUDE } from "@/lib/constants";
import { parsePagination } from "@/lib/api-utils";
import { buildGrantWhere } from "@/lib/grant-query";
import { logError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(params);
    const where = buildGrantWhere(params);

    const [grants, total] = await Promise.all([
      prisma.grant.findMany({
        where,
        include: GRANT_INCLUDE,
        orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.grant.count({ where }),
    ]);

    const response = NextResponse.json({
      data: grants,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
    response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return response;
  } catch (error) {
    logError("grants-api", "Failed to fetch grants", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdminOrResponse(request);
  if (admin instanceof NextResponse) return admin;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ids } = body as { ids?: unknown };

  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 100 ||
    !ids.every((id) => typeof id === "string")
  ) {
    return NextResponse.json(
      { error: "ids must be a non-empty array of strings (max 100)" },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.grant.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    logError("grants-api", "Failed to delete grants", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
