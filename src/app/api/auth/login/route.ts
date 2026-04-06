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
  // Always run bcrypt compare to prevent timing-based email enumeration.
  // When the user doesn't exist we compare against a dummy hash so the
  // response time is indistinguishable from a wrong-password attempt.
  const DUMMY_HASH = "$2a$12$000000000000000000000uGBB7IklYmTHlERVUX.F.FPJFPlJOweS";
  const isValid = await verifyPassword(password, admin?.passwordHash ?? DUMMY_HASH);
  if (!admin || !isValid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await signToken({
    sub: admin.id,
    email: admin.email,
    tokenVersion: admin.tokenVersion,
  });
  const response = NextResponse.json({
    success: true,
    admin: { id: admin.id, email: admin.email, name: admin.name },
  });
  setAuthCookie(response, token);
  return response;
}
