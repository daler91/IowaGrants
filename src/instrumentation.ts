export async function register() {
  // NEXT_RUNTIME is "nodejs" for the server runtime, "edge" for middleware.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await initSentry();
    await seedAdmin();
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await initSentry();
  }
}

async function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    const sampleRate = Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1");
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: Number.isFinite(sampleRate) ? sampleRate : 0.1,
    });
  } catch (error) {
    const { logError } = await import("@/lib/errors");
    logError("sentry", "Failed to initialize Sentry", error);
  }
}

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: "Pages Router" | "App Router"; routePath: string; routeType: string },
) {
  if (!process.env.SENTRY_DSN) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureRequestError(error, request, context);
  } catch {
    // Swallow — never let Sentry plumbing break request handling.
  }
}

async function seedAdmin() {
  // Imported dynamically to avoid pulling env.ts into edge runtime.
  const { env } = await import("@/lib/env");
  const { log, logError } = await import("@/lib/errors");
  const email = env.ADMIN_EMAIL;
  const password = env.ADMIN_PASSWORD;

  if (!email || !password) {
    log("seed", "Skipping admin seed: ADMIN_EMAIL or ADMIN_PASSWORD not set");
    return;
  }

  if (password.length < 12) {
    logError("seed", "ADMIN_PASSWORD must be at least 12 characters long");
    return;
  }

  try {
    const { PrismaClient } = await import("@prisma/client");
    const bcrypt = await import("bcryptjs");

    const prisma = new PrismaClient();
    try {
      const existing = await prisma.adminUser.findUnique({ where: { email } });
      if (existing) {
        // ADMIN_PASSWORD is the bootstrap source of truth. If it no longer
        // matches the stored hash (admin rotated it in the deploy config),
        // re-hash and persist so login uses the current value.
        const matches = await bcrypt.compare(password, existing.passwordHash);
        if (matches) {
          log("seed", `Admin already exists: ${existing.email} — password in sync`);
          return;
        }
        const passwordHash = await bcrypt.hash(password, 12);
        await prisma.adminUser.update({
          where: { id: existing.id },
          data: { passwordHash },
        });
        log("seed", `Admin password synced from ADMIN_PASSWORD for ${existing.email}`);
        return;
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const admin = await prisma.adminUser.create({
        data: { email, passwordHash, name: "Admin" },
      });
      log("seed", `Admin created: ${admin.email} (id: ${admin.id})`);
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    // Rethrow to fail startup — a silently broken admin seed leaves
    // the app running without login capability and no retry path.
    logError("seed", "Failed to seed admin", error);
    throw error;
  }
}
