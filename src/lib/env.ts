function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Lazy validation — only checks env vars when first accessed at runtime,
// not at import time (which happens during Next.js build).
export const env = {
  get DATABASE_URL() {
    return requireEnv("DATABASE_URL");
  },
  get CRON_SECRET() {
    return requireEnv("CRON_SECRET");
  },
} as const;
