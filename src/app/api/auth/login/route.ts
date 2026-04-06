import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, signToken, setAuthCookie } from "@/lib/auth";
import { parseJson } from "@/lib/http/parse-json";
import { loginSchema } from "@/lib/http/schemas";

export async function POST(request: NextRequest) {
  const result = await parseJson(request, loginSchema);
  if (result.error) return result.error;

  const { email, password } = result.data;

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  const token = await signToken({ sub: admin.id, email: admin.email, tokenVersion: admin.tokenVersion });
  const response = NextResponse.json({
    success: true,
    admin: { id: admin.id, email: admin.email, name: admin.name },
  });
  setAuthCookie(response, token);
  return response;
}
