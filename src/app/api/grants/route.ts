import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
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

  if (grantType) {
    where.grantType = grantType as Prisma.EnumGrantTypeFilter["equals"];
  }

  if (gender) {
    where.gender = gender as Prisma.EnumGenderFocusFilter["equals"];
  }

  if (businessStage) {
    where.businessStage = businessStage as Prisma.EnumBusinessStageFilter["equals"];
  }

  if (location) {
    where.locations = { has: location };
  }

  if (industry) {
    where.industries = { has: industry };
  }

  if (status) {
    where.status = status as Prisma.EnumGrantStatusFilter["equals"];
  }

  if (amountMin !== undefined) {
    where.amountMax = { gte: amountMin };
  }

  if (amountMax !== undefined) {
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

  return NextResponse.json({
    data: grants,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

export async function DELETE(request: NextRequest) {
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

  const result = await prisma.grant.deleteMany({
    where: { id: { in: ids } },
  });

  return NextResponse.json({ deleted: result.count });
}
