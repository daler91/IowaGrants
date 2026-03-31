import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const year = parseInt(params.get("year") || new Date().getFullYear().toString());
  const month = parseInt(params.get("month") || (new Date().getMonth() + 1).toString());

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const grants = await prisma.grant.findMany({
    where: {
      deadline: {
        gte: startDate,
        lte: endDate,
      },
      status: "OPEN",
    },
    select: {
      id: true,
      title: true,
      deadline: true,
      grantType: true,
      amount: true,
      sourceName: true,
    },
    orderBy: { deadline: "asc" },
  });

  // Group by date
  const grouped: Record<string, typeof grants> = {};
  for (const grant of grants) {
    if (grant.deadline) {
      const key = grant.deadline.toISOString().split("T")[0];
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(grant);
    }
  }

  return NextResponse.json({ year, month, grants: grouped });
}
