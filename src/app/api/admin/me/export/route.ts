import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { errorResponse, logError } from "@/lib/errors";

/**
 * Returns a JSON copy of the caller's admin record and the invites they
 * issued. Supports the GDPR/CCPA right to access: administrators can
 * download everything the system stores about them.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const record = await prisma.adminUser.findUnique({
      where: { id: admin.sub },
      select: {
        id: true,
        email: true,
        name: true,
        invitedBy: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!record) {
      return errorResponse(request, 404, "Admin not found", "NOT_FOUND");
    }
    const invitesIssued = await prisma.adminInvite.findMany({
      where: { invitedBy: admin.sub },
      select: { id: true, email: true, expiresAt: true, usedAt: true, createdAt: true },
    });

    const body = { admin: record, invitesIssued };
    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="admin-export-${admin.sub}.json"`,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return errorResponse(request, 401, "Unauthorized", "UNAUTHORIZED");
    }
    logError("admin-me-export", "Failed to export admin record", error);
    return errorResponse(request, 500, "Internal server error");
  }
}
