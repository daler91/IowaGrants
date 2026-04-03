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
      const passwordHash = await bcrypt.hash(password, 12);
      const admin = await prisma.adminUser.upsert({
        where: { email },
        update: { passwordHash },
        create: { email, passwordHash, name: "Admin" },
      });
      console.log(`[seed] Admin seeded: ${admin.email} (id: ${admin.id})`);
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    console.error("[seed] Failed to seed admin:", error instanceof Error ? error.message : error);
  }
}
