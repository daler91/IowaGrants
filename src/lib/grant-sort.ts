import type { Prisma } from "@prisma/client";
import type { GrantSortDir, GrantSortKey } from "@/lib/types";

/**
 * Default sort: earliest deadline first (nulls to the bottom), tie-break by
 * most recently added. Mirrors the original hardcoded orderBy in
 * `src/app/api/grants/route.ts` before Phase C.
 */
export const DEFAULT_SORT: GrantSortKey = "deadline";
export const DEFAULT_DIR: GrantSortDir = "asc";

const VALID_SORT_KEYS: readonly GrantSortKey[] = [
  "deadline",
  "rollingFirst",
  "amount",
  "recent",
  "title",
];

function normalizeSort(raw: string | null): GrantSortKey {
  if (!raw) return DEFAULT_SORT;
  return (VALID_SORT_KEYS as readonly string[]).includes(raw)
    ? (raw as GrantSortKey)
    : DEFAULT_SORT;
}

/**
 * Default direction per sort key. Picking "amount" → desc is more natural
 * than asc (users want biggest first); "recent" similarly.
 */
function defaultDirFor(sort: GrantSortKey): GrantSortDir {
  return sort === "amount" || sort === "recent" ? "desc" : "asc";
}

function normalizeDir(raw: string | null, sort: GrantSortKey): GrantSortDir {
  if (raw === "asc" || raw === "desc") return raw;
  return defaultDirFor(sort);
}

export interface ParsedSort {
  sort: GrantSortKey;
  dir: GrantSortDir;
  orderBy: Prisma.GrantOrderByWithRelationInput[];
}

/**
 * Parse `sort` and `dir` query params into a validated pair plus the
 * Prisma orderBy array. Unknown values fall back to the default sort,
 * so stale shareable URLs degrade gracefully instead of 400'ing.
 */
export function parseSortParams(params: URLSearchParams): ParsedSort {
  const sort = normalizeSort(params.get("sort"));
  const dir = normalizeDir(params.get("dir"), sort);
  return { sort, dir, orderBy: buildOrderBy(sort, dir) };
}

export function buildOrderBy(
  sort: GrantSortKey,
  dir: GrantSortDir,
): Prisma.GrantOrderByWithRelationInput[] {
  switch (sort) {
    case "deadline":
      return [{ deadline: { sort: dir, nulls: "last" } }, { createdAt: "desc" }];
    case "rollingFirst":
      return [{ deadline: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }];
    case "amount":
      return [
        { amountMax: { sort: dir, nulls: "last" } },
        { deadline: { sort: "asc", nulls: "last" } },
      ];
    case "recent":
      return [{ createdAt: dir }];
    case "title":
      return [{ title: dir }];
  }
}

/**
 * True when the given (sort, dir) pair is the default. Used by the URL
 * serializer to keep shareable links clean (no `?sort=deadline&dir=asc`
 * on first load).
 */
export function isDefaultSort(
  sort: GrantSortKey | undefined,
  dir: GrantSortDir | undefined,
): boolean {
  const effectiveSort = sort ?? DEFAULT_SORT;
  const effectiveDir = dir ?? defaultDirFor(effectiveSort);
  return effectiveSort === DEFAULT_SORT && effectiveDir === DEFAULT_DIR;
}
