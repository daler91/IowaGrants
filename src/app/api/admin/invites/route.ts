import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

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
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email } = body as { email?: string };
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
  }
  const trimmed = email.trim();
  // Simple O(n) email check — avoids regex backtracking (CodeQL polynomial-redos)
  const atIdx = trimmed.indexOf("@");
  const hasValidStructure =
    atIdx > 0 &&
    trimmed.indexOf("@", atIdx + 1) === -1 &&
    trimmed.indexOf(".", atIdx + 2) > atIdx &&
    !trimmed.includes(" ") &&
    trimmed.length <= 254;
  if (!hasValidStructure) {
    return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An admin with this email already exists" },
      { status: 409 },
    );
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

  // Return raw token only once — it is stored as a SHA-256 hash
  return NextResponse.json({
    invite: {
      id: invite.id,
      email: invite.email,
      token: rawToken,
      expiresAt: invite.expiresAt,
    },
  });
}
