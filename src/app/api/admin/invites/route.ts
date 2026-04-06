import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { errorResponse, log } from "@/lib/errors";
import { parseJson } from "@/lib/http/parse-json";
import { inviteSchema } from "@/lib/http/schemas";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const invites = await prisma.adminInvite.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        invitedBy: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ invites });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return errorResponse(request, 401, "Unauthorized", "UNAUTHORIZED");
    }
    throw err;
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);

    const result = await parseJson(request, inviteSchema);
    if (result.error) return result.error;

    const email = result.data.email.trim();

    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing) {
      return errorResponse(request, 409, "An admin with this email already exists", "ADMIN_EXISTS");
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

    const invite = await prisma.adminInvite.create({
      data: {
        email,
        token: tokenHash,
        invitedBy: admin.email,
        expiresAt,
      },
    });

    log("admin-audit", "Invite created", { admin: admin.email, invitedEmail: email });

    // Return raw token only once — it is stored as a SHA-256 hash
    return NextResponse.json({
      invite: {
        id: invite.id,
        email: invite.email,
        token: rawToken,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return errorResponse(request, 401, "Unauthorized", "UNAUTHORIZED");
    }
    throw err;
  }
}
