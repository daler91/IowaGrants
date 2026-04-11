import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { GRANT_INCLUDE } from "@/lib/constants";
import { parsePagination } from "@/lib/api-utils";
import { buildGrantWhere } from "@/lib/grant-query";
import { parseSortParams } from "@/lib/grant-sort";
import { errorResponse, log, logError } from "@/lib/errors";
import { parseJson } from "@/lib/http/parse-json";
import { deleteIdsSchema } from "@/lib/http/schemas";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(params);
    const where = buildGrantWhere(params);
    const { orderBy } = parseSortParams(params);

    const [grants, total] = await Promise.all([
      prisma.grant.findMany({
        where,
        include: GRANT_INCLUDE,
        orderBy,
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
    return errorResponse(request, 500, "Internal server error");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);

    const result = await parseJson(request, deleteIdsSchema);
    if (result.error) return result.error;

    const { ids } = result.data;

    const deleteResult = await prisma.grant.deleteMany({
      where: { id: { in: ids } },
    });

    log("admin-audit", "Grants deleted", { admin: admin.email, deleted: deleteResult.count, ids });

    return NextResponse.json({ deleted: deleteResult.count });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return errorResponse(request, 401, "Unauthorized", "UNAUTHORIZED");
    }
    logError("grants-api", "Failed to delete grants", err);
    return errorResponse(request, 500, "Internal server error");
  }
}
