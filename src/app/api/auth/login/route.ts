import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, signToken, setAuthCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, password } = body as { email?: unknown; password?: unknown };
  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 },
    );
  }

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  const token = await signToken({ sub: admin.id, email: admin.email });
  const response = NextResponse.json({
    success: true,
    admin: { id: admin.id, email: admin.email, name: admin.name },
  });
  setAuthCookie(response, token);
  return response;
}
