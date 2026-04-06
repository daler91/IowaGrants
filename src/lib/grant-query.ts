import { Prisma } from "@prisma/client";
import {
  VALID_GRANT_TYPES,
  VALID_GENDER_FOCUS,
  VALID_BUSINESS_STAGE,
  VALID_GRANT_STATUS,
} from "@/lib/constants";
import { parseOptionalInt } from "@/lib/api-utils";

/**
 * Parse a multi-valued filter query param. Accepts either a single value
 * ("FEDERAL") or a comma-separated list ("FEDERAL,STATE"). Unknown values
 * are dropped so filters degrade gracefully.
 */
function parseMultiParam(
  params: URLSearchParams,
  key: string,
  allowed?: readonly string[],
): string[] {
  const raw = params.get(key);
  if (!raw) return [];
  const values = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowed) return values;
  return values.filter((v) => allowed.includes(v));
}

/**
 * Build a Prisma `where` clause from grant list/export URL search params.
 * Shared between `GET /api/grants` and `GET /api/grants/export` so filter
 * semantics stay in a single place.
 */
function existingAndClauses(where: Prisma.GrantWhereInput): Prisma.GrantWhereInput[] {
  if (Array.isArray(where.AND)) return where.AND;
  if (where.AND) return [where.AND];
  return [];
}

function buildStatusClauses(statuses: string[]): Prisma.GrantWhereInput[] {
  const now = new Date();
  const clauses: Prisma.GrantWhereInput[] = [];

  if (statuses.includes("OPEN")) {
    clauses.push({
      status: "OPEN",
      OR: [{ deadline: null }, { deadline: { gte: now } }],
    });
  }

  if (statuses.includes("CLOSED")) {
    clauses.push({ status: "CLOSED" }, { status: "OPEN", deadline: { lt: now } });
  }

  if (statuses.includes("FORECASTED")) {
    clauses.push({ status: "FORECASTED" });
  }

  return clauses;
}

function applyStatusFilter(where: Prisma.GrantWhereInput, statuses: string[]): void {
  const statusClauses = buildStatusClauses(statuses);
  if (statusClauses.length === 0) return;

  const clause =
    statusClauses.length === 1 ? statusClauses[0] : { OR: statusClauses };
  where.AND = [...existingAndClauses(where), clause];
}

export function buildGrantWhere(params: URLSearchParams): Prisma.GrantWhereInput {
  const search = params.get("search") || undefined;
  const grantTypes = parseMultiParam(params, "grantType", VALID_GRANT_TYPES);
  const genders = parseMultiParam(params, "gender", VALID_GENDER_FOCUS);
  const businessStages = parseMultiParam(params, "businessStage", VALID_BUSINESS_STAGE);
  const statuses = parseMultiParam(params, "status", VALID_GRANT_STATUS);
  const eligibleExpenses = parseMultiParam(params, "eligibleExpense");
  const location = params.get("location") || undefined;
  const industry = params.get("industry") || undefined;
  const amountMin = parseOptionalInt(params, "amountMin");
  const amountMax = parseOptionalInt(params, "amountMax");

  const where: Prisma.GrantWhereInput = {};

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  if (grantTypes.length) {
    where.grantType = { in: grantTypes as Prisma.EnumGrantTypeFilter["in"] };
  }

  if (genders.length) {
    where.gender = { in: genders as Prisma.EnumGenderFocusFilter["in"] };
  }

  if (businessStages.length) {
    where.businessStage = { in: businessStages as Prisma.EnumBusinessStageFilter["in"] };
  }

  if (location) where.locations = { has: location };
  if (industry) where.industries = { has: industry };
  if (statuses.length) applyStatusFilter(where, statuses);

  if (amountMin !== undefined && !Number.isNaN(amountMin)) {
    where.amountMax = { gte: amountMin };
  }

  if (amountMax !== undefined && !Number.isNaN(amountMax)) {
    where.amountMin = { lte: amountMax };
  }

  if (eligibleExpenses.length) {
    where.eligibleExpenses = {
      some: { name: { in: eligibleExpenses } },
    };
  }

  return where;
}
