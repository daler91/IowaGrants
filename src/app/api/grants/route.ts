import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { GRANT_INCLUDE } from "@/lib/constants";
import { parsePagination } from "@/lib/api-utils";
import { buildGrantWhere } from "@/lib/grant-query";
import { logError } from "@/lib/errors";
import { parseJson } from "@/lib/http/parse-json";
import { deleteIdsSchema } from "@/lib/http/schemas";

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
  try {
    await requireAdmin(request);

    const result = await parseJson(request, deleteIdsSchema);
    if (result.error) return result.error;

    const { ids } = result.data;

    const deleteResult = await prisma.grant.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({ deleted: deleteResult.count });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("grants-api", "Failed to delete grants", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
