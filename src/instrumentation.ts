export async function register() {
  // Only seed on the server side (not edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await seedAdmin();
  }
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("[seed] Skipping admin seed: ADMIN_EMAIL or ADMIN_PASSWORD not set");
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
