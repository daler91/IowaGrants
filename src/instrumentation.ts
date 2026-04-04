export async function register() {
  // Only seed on the server side (not edge runtime)
  // Note: NEXT_RUNTIME is set by Next.js itself before instrumentation runs,
  // so it must be read directly from process.env (not via env.ts).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await seedAdmin();
  }
}

async function seedAdmin() {
  // Imported dynamically to avoid pulling env.ts into edge runtime.
  const { env } = await import("@/lib/env");
  const email = env.ADMIN_EMAIL;
  const password = env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("[seed] Skipping admin seed: ADMIN_EMAIL or ADMIN_PASSWORD not set");
    return;
  }

  if (password.length < 12) {
    console.error("[seed] ADMIN_PASSWORD must be at least 12 characters long");
    return;
  }

  try {
    const { PrismaClient } = await import("@prisma/client");
    const bcrypt = await import("bcryptjs");

    const prisma = new PrismaClient();
    try {
      const existing = await prisma.adminUser.findUnique({ where: { email } });
      if (existing) {
        console.log(`[seed] Admin already exists: ${existing.email} — skipping seed`);
        return;
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const admin = await prisma.adminUser.create({
        data: { email, passwordHash, name: "Admin" },
      });
      console.log(`[seed] Admin created: ${admin.email} (id: ${admin.id})`);
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    // Rethrow to fail startup — a silently broken admin seed leaves
    // the app running without login capability and no retry path.
    console.error("[seed] Failed to seed admin:", error instanceof Error ? error.message : error);
    throw error;
  }
}
