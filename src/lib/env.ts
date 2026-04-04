function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback?: string): string | undefined {
  return process.env[name] || fallback;
}

// Lazy validation — only checks env vars when first accessed at runtime,
// not at import time (which happens during Next.js build).
export const env = {
  // ── Required ──────────────────────────────────────────────────────
  get DATABASE_URL() {
    return requireEnv("DATABASE_URL");
  },
  get CRON_SECRET() {
    return requireEnv("CRON_SECRET");
  },
  get JWT_SECRET() {
    return requireEnv("JWT_SECRET");
  },

  // ── Optional API keys (scrapers degrade gracefully without these) ─
  get ANTHROPIC_API_KEY() {
    return optionalEnv("ANTHROPIC_API_KEY");
  },
  get SAM_GOV_API_KEY() {
    return optionalEnv("SAM_GOV_API_KEY");
  },
  get SIMPLER_GRANTS_API_KEY() {
    return optionalEnv("SIMPLER_GRANTS_API_KEY");
  },
  get AIRTABLE_API_KEY() {
    return optionalEnv("AIRTABLE_API_KEY");
  },
  get BRAVE_SEARCH_API_KEY() {
    return optionalEnv("BRAVE_SEARCH_API_KEY");
  },
  get SERPAPI_API_KEY() {
    return optionalEnv("SERPAPI_API_KEY");
  },

  // ── Optional config with defaults ─────────────────────────────────
  get GRANTS_GOV_API_URL() {
    return optionalEnv(
      "GRANTS_GOV_API_URL",
      "https://api.grants.gov/v1/opportunities/search"
    );
  },
  get LWL_AIRTABLE_BASE_ID() {
    return optionalEnv("LWL_AIRTABLE_BASE_ID") || "";
  },
  get LWL_AIRTABLE_TABLE_NAME() {
    return optionalEnv("LWL_AIRTABLE_TABLE_NAME") || "";
  },
  get LWL_AIRTABLE_VIEW_ID() {
    return optionalEnv("LWL_AIRTABLE_VIEW_ID") || "";
  },

  // ── Admin seeding ─────────────────────────────────────────────────
  get ADMIN_EMAIL() {
    return optionalEnv("ADMIN_EMAIL");
  },
  get ADMIN_PASSWORD() {
    return optionalEnv("ADMIN_PASSWORD");
  },

  // ── Runtime ───────────────────────────────────────────────────────
  get NODE_ENV() {
    return optionalEnv("NODE_ENV", "development")!;
  },
  get isProduction() {
    return this.NODE_ENV === "production";
  },
} as const;
