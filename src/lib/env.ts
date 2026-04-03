import { randomBytes } from "crypto";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let generatedJwtSecret: string | null = null;

// Lazy validation — only checks env vars when first accessed at runtime,
// not at import time (which happens during Next.js build).
export const env = {
  get DATABASE_URL() {
    return requireEnv("DATABASE_URL");
  },
  get CRON_SECRET() {
    return requireEnv("CRON_SECRET");
  },
  get JWT_SECRET() {
    const value = process.env.JWT_SECRET;
    if (value) return value;

    // Generate a random secret so the app doesn't crash, but warn loudly.
    // Sessions will not survive restarts without a stable JWT_SECRET.
    if (!generatedJwtSecret) {
      generatedJwtSecret = randomBytes(32).toString("hex");
      console.warn(
        "[env] WARNING: JWT_SECRET is not set. Using a random secret — admin sessions will not survive restarts. Set JWT_SECRET in your environment.",
      );
    }
    return generatedJwtSecret;
  },
} as const;
