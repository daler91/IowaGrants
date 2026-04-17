import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const timestamp = new Date().toISOString();
  const deep = request.nextUrl.searchParams.get("deep") === "true";

  if (!deep) {
    return NextResponse.json({ status: "ok", timestamp });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", timestamp, db: "ok" });
  } catch (error) {
    logError("health", "Deep health check failed", error);
    return NextResponse.json({ status: "error", timestamp, db: "down" }, { status: 503 });
  }
}
