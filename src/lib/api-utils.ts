/**
 * Parse pagination parameters from URL search params.
 * Ensures consistent parsing across all API routes.
 */
export function parsePagination(
  params: URLSearchParams,
  defaults: { page?: number; limit?: number } = {}
): { page: number; limit: number; skip: number } {
  const { page: defaultPage = 1, limit: defaultLimit = 20 } = defaults;
  const page = Math.max(1, Number.parseInt(params.get("page") || String(defaultPage)));
  const limit = Math.min(100, Math.max(1, Number.parseInt(params.get("limit") || String(defaultLimit))));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Parse an optional integer from search params.
 * Returns undefined if the param is missing or not a valid integer.
 */
export function parseOptionalInt(params: URLSearchParams, name: string): number | undefined {
  const value = params.get(name);
  if (!value) return undefined;
  const parsed = Number.parseInt(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}
