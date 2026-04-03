import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";

const VALID_GRANT_TYPES = ["FEDERAL", "STATE", "LOCAL", "PRIVATE"];
const VALID_GENDER_FOCUS = ["WOMEN", "VETERAN", "MINORITY", "GENERAL", "ANY"];
const VALID_BUSINESS_STAGE = ["STARTUP", "EXISTING", "BOTH"];
const VALID_GRANT_STATUS = ["OPEN", "CLOSED", "FORECASTED"];

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
    const amountMinParam = params.get("amountMin");
    const amountMin = amountMinParam
      ? Number.parseInt(amountMinParam)
      : undefined;
    const amountMaxParam = params.get("amountMax");
    const amountMax = amountMaxParam
      ? Number.parseInt(amountMaxParam)
      : undefined;
    const page = Math.max(1, Number.parseInt(params.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, Number.parseInt(params.get("limit") || "20")));

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
        include: {
          categories: true,
          eligibleExpenses: true,
        },
        orderBy: [
          { deadline: { sort: "asc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * limit,
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
    console.error("Failed to fetch grants:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
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
    !ids.every((id) => typeof id === "string")
  ) {
    return NextResponse.json(
      { error: "ids must be a non-empty array of strings" },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.grant.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error("Failed to delete grants:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
