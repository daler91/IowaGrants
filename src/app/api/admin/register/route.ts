import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, signToken, setAuthCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { token, password, name } = body as {
    token?: unknown;
    password?: unknown;
    name?: unknown;
  };

  if (!token || !password || typeof token !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { error: "Token and password are required" },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }

  const invite = await prisma.adminInvite.findUnique({ where: { token } });
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
        name: typeof name === "string" ? name : null,
        invitedBy: invite.invitedBy,
      },
    }),
    prisma.adminInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    }),
  ]);

  const jwt = await signToken({ sub: admin.id, email: admin.email });
  const response = NextResponse.json({
    success: true,
    admin: { id: admin.id, email: admin.email, name: admin.name },
  });
  setAuthCookie(response, jwt);
  return response;
}
