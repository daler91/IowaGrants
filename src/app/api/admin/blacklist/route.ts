import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { parsePagination } from "@/lib/api-utils";
import { parseJson } from "@/lib/http/parse-json";
import { blacklistPostSchema, deleteIdsSchema } from "@/lib/http/schemas";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { page, limit, skip } = parsePagination(request.nextUrl.searchParams, { limit: 50 });

    const [urls, total] = await Promise.all([
      prisma.blacklistedUrl.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.blacklistedUrl.count(),
    ]);

    return NextResponse.json({
      urls,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);

    const result = await parseJson(request, blacklistPostSchema);
    if (result.error) return result.error;

    const { urls, reason } = result.data;

    const results = await Promise.allSettled(
      urls.map((url) =>
        prisma.blacklistedUrl.create({
          data: {
            url,
            reason: reason || null,
            blacklistedBy: admin.email,
          },
        }),
      ),
    );

    const created = results.filter((r) => r.status === "fulfilled").length;
    const duplicates = results.filter((r) => r.status === "rejected").length;

    return NextResponse.json({ created, duplicates });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin(request);

    const result = await parseJson(request, deleteIdsSchema);
    if (result.error) return result.error;

    const { ids } = result.data;

    const deleteResult = await prisma.blacklistedUrl.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({ deleted: deleteResult.count });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
}
