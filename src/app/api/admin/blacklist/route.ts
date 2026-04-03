import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 50));

  const [urls, total] = await Promise.all([
    prisma.blacklistedUrl.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
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
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { urls, reason } = body as { urls?: string[]; reason?: string };
  if (!Array.isArray(urls) || urls.length === 0 || !urls.every((u) => typeof u === "string")) {
    return NextResponse.json(
      { error: "urls must be a non-empty array of strings" },
      { status: 400 },
    );
  }

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

  const { ids } = body as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string")) {
    return NextResponse.json(
      { error: "ids must be a non-empty array of strings" },
      { status: 400 },
    );
  }

  const result = await prisma.blacklistedUrl.deleteMany({
    where: { id: { in: ids } },
  });

  return NextResponse.json({ deleted: result.count });
}
