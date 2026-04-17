import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { GRANT_INCLUDE, truncateDescription } from "@/lib/constants";
import { errorResponse, log, logError } from "@/lib/errors";
import { parseJson } from "@/lib/http/parse-json";
import { grantUpdateSchema } from "@/lib/http/schemas";
import { z } from "zod";

type GrantUpdatePayload = z.infer<typeof grantUpdateSchema>;

const REQUIRED_STRING_FIELDS = ["title", "description", "sourceName", "sourceUrl"] as const;
const OPTIONAL_STRING_FIELDS = ["amount", "eligibility", "pdfUrl"] as const;
const INTEGER_FIELDS = ["amountMin", "amountMax"] as const;
const ARRAY_FIELDS = ["locations", "industries"] as const;

function setRequiredStrings(data: Prisma.GrantUpdateInput, body: GrantUpdatePayload) {
  for (const field of REQUIRED_STRING_FIELDS) {
    if (body[field] === undefined) continue;
    const trimmed = body[field]!.trim();
    (data as Record<string, unknown>)[field] =
      field === "description" ? truncateDescription(trimmed) : trimmed;
  }
}

function setOptionalStrings(data: Prisma.GrantUpdateInput, body: GrantUpdatePayload) {
  for (const field of OPTIONAL_STRING_FIELDS) {
    if (body[field] === undefined) continue;
    const value = body[field];
    (data as Record<string, unknown>)[field] = value === null || value === "" ? null : value.trim();
  }
}

function setIntegerFields(data: Prisma.GrantUpdateInput, body: GrantUpdatePayload) {
  for (const field of INTEGER_FIELDS) {
    if (body[field] !== undefined) {
      (data as Record<string, unknown>)[field] = body[field];
    }
  }
}

function parseDeadline(deadline: string | null | undefined) {
  if (deadline === undefined) return { shouldSet: false as const };
  if (deadline === null) return { shouldSet: true as const, value: null as Date | null };

  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) {
    return { shouldSet: true as const, error: "deadline must be a valid date string or null" };
  }

  return { shouldSet: true as const, value: date };
}

function setEnumFields(data: Prisma.GrantUpdateInput, body: GrantUpdatePayload) {
  if (body.grantType !== undefined) {
    data.grantType = body.grantType as Prisma.EnumGrantTypeFieldUpdateOperationsInput["set"];
  }
  if (body.status !== undefined) {
    data.status = body.status as Prisma.EnumGrantStatusFieldUpdateOperationsInput["set"];
  }
  if (body.businessStage !== undefined) {
    data.businessStage =
      body.businessStage as Prisma.EnumBusinessStageFieldUpdateOperationsInput["set"];
  }
  if (body.gender !== undefined) {
    data.gender = body.gender as Prisma.EnumGenderFocusFieldUpdateOperationsInput["set"];
  }
}

function setArrayFields(data: Prisma.GrantUpdateInput, body: GrantUpdatePayload) {
  for (const field of ARRAY_FIELDS) {
    if (body[field] === undefined) continue;
    (data as Record<string, unknown>)[field] = body[field]
      .map((value: string) => value.trim())
      .filter((value: string) => value.length > 0);
  }
}

function buildUpdateData(body: GrantUpdatePayload) {
  const data: Prisma.GrantUpdateInput = {};
  setRequiredStrings(data, body);
  setOptionalStrings(data, body);
  setIntegerFields(data, body);
  setEnumFields(data, body);
  setArrayFields(data, body);

  const parsedDeadline = parseDeadline(body.deadline);
  return { data, parsedDeadline };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const grant = await prisma.grant.findUnique({
      where: { id },
      include: GRANT_INCLUDE,
    });

    if (!grant) {
      return errorResponse(request, 404, "Grant not found", "NOT_FOUND");
    }

    const response = NextResponse.json(grant);
    // OPEN / CLOSED / FORECASTED grants are safe to cache for 5 min at the
    // edge. DRAFT (if it ever exists) stays uncached.
    if (grant.status !== "FORECASTED") {
      response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    }
    return response;
  } catch (error) {
    logError("grants-api", "Failed to fetch grant", error);
    return errorResponse(request, 500, "Internal server error");
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(request);

    const result = await parseJson(request, grantUpdateSchema);
    if (result.error) return result.error;

    const { id } = await params;

    const existing = await prisma.grant.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(request, 404, "Grant not found", "NOT_FOUND");
    }

    const body = result.data;
    const { data, parsedDeadline } = buildUpdateData(body);

    if (parsedDeadline.error) {
      return errorResponse(request, 400, parsedDeadline.error, "INVALID_DEADLINE");
    }

    if (parsedDeadline.shouldSet) {
      data.deadline = parsedDeadline.value;
    }

    if (Object.keys(data).length === 0) {
      return errorResponse(request, 400, "No valid fields to update", "EMPTY_UPDATE");
    }

    const updated = await prisma.grant.update({
      where: { id },
      data,
      include: GRANT_INCLUDE,
    });

    log("admin-audit", "Grant updated", { admin: admin.email, grantId: id });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return errorResponse(request, 401, "Unauthorized", "UNAUTHORIZED");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse(
        request,
        409,
        "A grant with this source URL already exists",
        "DUPLICATE_SOURCE",
      );
    }
    logError("grants-api", "Failed to update grant", error);
    return errorResponse(request, 500, "Internal server error");
  }
}
