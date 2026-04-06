import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { revalidateExistingGrants } from "@/lib/scrapers/revalidate-existing";
import { errorResponse, log, logError } from "@/lib/errors";
import { parseJson } from "@/lib/http/parse-json";
import { revalidateSchema } from "@/lib/http/schemas";

export const maxDuration = 300; // 5 minute timeout — sweep fetches many URLs

export async function POST(request: NextRequest) {
  let admin: { sub: string; email: string };
  try {
    admin = await requireAdmin(request);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return errorResponse(request, 401, "Unauthorized", "UNAUTHORIZED");
    }
    throw err;
  }

  const result = await parseJson(request, revalidateSchema);
  if (result.error) return result.error;
  const { limit } = result.data;

  try {
    const summary = await revalidateExistingGrants({ limit });
    log("admin-audit", "Revalidation triggered", { admin: admin.email, limit, ...summary });
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    logError("admin-revalidate", "Revalidate sweep failed", error);
    return errorResponse(request, 500, "Internal server error", "REVALIDATE_FAILED");
  }
}
