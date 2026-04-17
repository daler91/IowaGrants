import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { errorResponse, log, logError } from "@/lib/errors";

/**
 * Revokes every outstanding admin JWT by bumping every admin's tokenVersion.
 * The caller's own session is also invalidated on the next request; the
 * client is expected to re-login.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);

    const { count } = await prisma.adminUser.updateMany({
      data: { tokenVersion: { increment: 1 } },
    });

    log("admin-audit", "Global tokenVersion bump", {
      admin: admin.email,
      bumped: count,
    });

    return NextResponse.json({ bumped: count });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return errorResponse(request, 401, "Unauthorized", "UNAUTHORIZED");
    }
    logError("admin-security", "Failed to bump global tokenVersion", error);
    return errorResponse(request, 500, "Internal server error");
  }
}
