import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookie, getAdminFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/errors";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  clearAuthCookie(response);

  // Invalidate every outstanding JWT for this admin by bumping tokenVersion.
  // If the cookie is missing or invalid we still return success so the client
  // can finish its logout flow without leaking whether an account existed.
  try {
    const claims = await getAdminFromRequest(request);
    if (claims) {
      await prisma.adminUser.update({
        where: { id: claims.sub },
        data: { tokenVersion: { increment: 1 } },
      });
    }
  } catch (error) {
    logError("auth-logout", "Failed to bump tokenVersion on logout", error);
  }

  return response;
}
