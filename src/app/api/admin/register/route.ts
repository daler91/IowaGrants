import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { hashPassword, signToken, setAuthCookie } from "@/lib/auth";
import { parseJson } from "@/lib/http/parse-json";
import { registerSchema } from "@/lib/http/schemas";

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  const result = await parseJson(request, registerSchema);
  if (result.error) return result.error;

  const { token, password, name } = result.data;

  const invite = await prisma.adminInvite.findUnique({ where: { token: hashInviteToken(token) } });
  if (!invite) {
    return NextResponse.json({ error: "Invalid invite token" }, { status: 400 });
  }
  if (invite.usedAt) {
    return NextResponse.json(
      { error: "This invite has already been used" },
      { status: 400 },
    );
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "This invite has expired" },
      { status: 400 },
    );
  }

  const existing = await prisma.adminUser.findUnique({
    where: { email: invite.email },
  });
  if (existing) {
    return NextResponse.json(
      { error: "An admin with this email already exists" },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);

  const [admin] = await prisma.$transaction([
    prisma.adminUser.create({
      data: {
        email: invite.email,
        passwordHash,
        name: name ?? null,
        invitedBy: invite.invitedBy,
      },
    }),
    prisma.adminInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    }),
  ]);

  const jwt = await signToken({ sub: admin.id, email: admin.email, tokenVersion: admin.tokenVersion });
  const response = NextResponse.json({
    success: true,
    admin: { id: admin.id, email: admin.email, name: admin.name },
  });
  setAuthCookie(response, jwt);
  return response;
}
