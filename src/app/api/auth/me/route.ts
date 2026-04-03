import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const payload = await getAdminFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await prisma.adminUser.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true },
  });

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ admin });
}
