import { Prisma } from "@prisma/client";
import {
  VALID_GRANT_TYPES,
  VALID_GENDER_FOCUS,
  VALID_BUSINESS_STAGE,
  VALID_GRANT_STATUS,
} from "@/lib/constants";
import { parseOptionalInt } from "@/lib/api-utils";

/**
 * Build a Prisma `where` clause from grant list/export URL search params.
 * Shared between `GET /api/grants` and `GET /api/grants/export` so filter
 * semantics stay in a single place.
 */
export function buildGrantWhere(params: URLSearchParams): Prisma.GrantWhereInput {
  const search = params.get("search") || undefined;
  const grantType = params.get("grantType") || undefined;
  const gender = params.get("gender") || undefined;
  const businessStage = params.get("businessStage") || undefined;
  const location = params.get("location") || undefined;
  const industry = params.get("industry") || undefined;
  const status = params.get("status") || undefined;
  const eligibleExpense = params.get("eligibleExpense") || undefined;
  const amountMin = parseOptionalInt(params, "amountMin");
  const amountMax = parseOptionalInt(params, "amountMax");

  const where: Prisma.GrantWhereInput = {};

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  if (grantType && VALID_GRANT_TYPES.includes(grantType)) {
    where.grantType = grantType as Prisma.EnumGrantTypeFilter["equals"];
  }

  if (gender && VALID_GENDER_FOCUS.includes(gender)) {
    where.gender = gender as Prisma.EnumGenderFocusFilter["equals"];
  }

  if (businessStage && VALID_BUSINESS_STAGE.includes(businessStage)) {
    where.businessStage = businessStage as Prisma.EnumBusinessStageFilter["equals"];
  }

  if (location) {
    where.locations = { has: location };
  }

  if (industry) {
    where.industries = { has: industry };
  }

  if (status && VALID_GRANT_STATUS.includes(status)) {
    where.status = status as Prisma.EnumGrantStatusFilter["equals"];
  }

  if (amountMin !== undefined && !Number.isNaN(amountMin)) {
    where.amountMax = { gte: amountMin };
  }

  if (amountMax !== undefined && !Number.isNaN(amountMax)) {
    where.amountMin = { lte: amountMax };
  }

  if (eligibleExpense) {
    where.eligibleExpenses = {
      some: { name: eligibleExpense },
    };
  }

  return where;
}
