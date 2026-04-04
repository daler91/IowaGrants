import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requireAdminOrResponse } from "@/lib/auth";
import {
  VALID_GRANT_TYPES,
  VALID_GENDER_FOCUS,
  VALID_BUSINESS_STAGE,
  VALID_GRANT_STATUS,
  GRANT_INCLUDE,
} from "@/lib/constants";
import { parsePagination, parseOptionalInt } from "@/lib/api-utils";
import { logError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const search = params.get("search") || undefined;
    const grantType = params.get("grantType") || undefined;
    const gender = params.get("gender") || undefined;
    const businessStage = params.get("businessStage") || undefined;
    const location = params.get("location") || undefined;
    const industry = params.get("industry") || undefined;
    const status = params.get("status") || undefined;
    const eligibleExpense = params.get("eligibleExpense") || undefined;
    const amountMin = parseOptionalInt(params, "amountMin");
    const amountMax = parseOptionalInt(params, "amountMax");
    const { page, limit, skip } = parsePagination(params);

    const where: Prisma.GrantWhereInput = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (grantType && VALID_GRANT_TYPES.includes(grantType)) {
      where.grantType = grantType as Prisma.EnumGrantTypeFilter["equals"];
    }

    if (gender && VALID_GENDER_FOCUS.includes(gender)) {
      where.gender = gender as Prisma.EnumGenderFocusFilter["equals"];
    }

    if (businessStage && VALID_BUSINESS_STAGE.includes(businessStage)) {
      where.businessStage = businessStage as Prisma.EnumBusinessStageFilter["equals"];
    }

    if (location) {
      where.locations = { has: location };
    }

    if (industry) {
      where.industries = { has: industry };
    }

    if (status && VALID_GRANT_STATUS.includes(status)) {
      where.status = status as Prisma.EnumGrantStatusFilter["equals"];
    }

    if (amountMin !== undefined && !Number.isNaN(amountMin)) {
      where.amountMax = { gte: amountMin };
    }

    if (amountMax !== undefined && !Number.isNaN(amountMax)) {
      where.amountMin = { lte: amountMax };
    }

    if (eligibleExpense) {
      where.eligibleExpenses = {
        some: { name: eligibleExpense },
      };
    }

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
