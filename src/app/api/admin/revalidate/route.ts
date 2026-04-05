import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrResponse } from "@/lib/auth";
import { revalidateExistingGrants } from "@/lib/scrapers/revalidate-existing";
import { logError } from "@/lib/errors";

export const maxDuration = 300; // 5 minute timeout — sweep fetches many URLs

export async function POST(request: NextRequest) {
  const admin = await requireAdminOrResponse(request);
  if (admin instanceof NextResponse) return admin;

  let limit = 200;
  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    if (typeof body.limit === "number" && body.limit > 0 && body.limit <= 1000) {
      limit = Math.floor(body.limit);
    }
  } catch {
    // ignore — use default
  }

  try {
    const summary = await revalidateExistingGrants({ limit });
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    logError("admin-revalidate", "Revalidate sweep failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
