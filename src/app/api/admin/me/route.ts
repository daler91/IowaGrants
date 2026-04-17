import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clearAuthCookie, requireAdmin, UnauthorizedError } from "@/lib/auth";
import { errorResponse, log, logError } from "@/lib/errors";

/**
 * Deletes the caller's admin record. Refused when it would leave zero
 * admins so the system is never locked out. Clears the session cookie
 * and returns 204.
 */
export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const remaining = await prisma.adminUser.count({ where: { id: { not: admin.sub } } });
    if (remaining === 0) {
      return errorResponse(request, 409, "Cannot delete the only remaining admin", "LAST_ADMIN");
    }

    await prisma.adminUser.delete({ where: { id: admin.sub } });
    log("admin-audit", "Admin self-deletion", { admin: admin.email });

    const response = new NextResponse(null, { status: 204 });
    clearAuthCookie(response);
    return response;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return errorResponse(request, 401, "Unauthorized", "UNAUTHORIZED");
    }
    logError("admin-me", "Failed to delete admin", error);
    return errorResponse(request, 500, "Internal server error");
  }
}
