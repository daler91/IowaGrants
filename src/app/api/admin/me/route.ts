import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { clearAuthCookie, requireAdmin, UnauthorizedError } from "@/lib/auth";
import { errorResponse, log, logError } from "@/lib/errors";

class LastAdminError extends Error {}

/**
 * Deletes the caller's admin record. Refused when it would leave zero
 * admins so the system is never locked out. Clears the session cookie
 * and returns 204.
 *
 * The count-and-delete runs in a SERIALIZABLE transaction so two admins
 * self-deleting concurrently can't both observe `remaining > 0` and
 * succeed — Postgres will abort the losing transaction and Prisma
 * surfaces a retryable error, which we treat as LastAdminError.
 */
export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);

    try {
      await prisma.$transaction(
        async (tx) => {
          const total = await tx.adminUser.count();
          if (total <= 1) throw new LastAdminError();
          await tx.adminUser.delete({ where: { id: admin.sub } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (txError) {
      if (txError instanceof LastAdminError) {
        return errorResponse(request, 409, "Cannot delete the only remaining admin", "LAST_ADMIN");
      }
      // Serialization failure surfaces as P2034 on Postgres; retry the
      // whole handler once. If it fails again the caller sees 500.
      if (txError instanceof Prisma.PrismaClientKnownRequestError && txError.code === "P2034") {
        return errorResponse(
          request,
          409,
          "Delete retry collided with another admin change; try again",
          "TX_CONFLICT",
        );
      }
      throw txError;
    }

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
