import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { GRANT_INCLUDE_DETAIL } from "@/lib/constants";
import { parsePagination } from "@/lib/api-utils";
import { computeDisplayStatus } from "@/lib/deadline";
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
        include: GRANT_INCLUDE_DETAIL,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.grant.count({ where }),
    ]);

    // Decorate each grant with a server-computed displayStatus so the
    // client doesn't have to (and can't get timezone drift wrong).
    const data = grants.map((g) => ({
      ...g,
      displayStatus: computeDisplayStatus(g.status, g.deadline),
    }));

    const response = NextResponse.json({
      data,
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

const BULK_DELETE_CONFIRM_THRESHOLD = 10;

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);

    const result = await parseJson(request, deleteIdsSchema);
    if (result.error) return result.error;

    const { ids } = result.data;

    // Defense in depth: require an explicit confirmation flag when the
    // caller is deleting a large batch. Prevents a misfired client
    // request from wiping the DB.
    if (ids.length > BULK_DELETE_CONFIRM_THRESHOLD) {
      const confirm = request.nextUrl.searchParams.get("confirmBulk");
      if (confirm !== "true") {
        return errorResponse(
          request,
          409,
          `Bulk delete of ${ids.length} grants requires confirmBulk=true`,
          "BULK_CONFIRM_REQUIRED",
        );
      }
    }

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
