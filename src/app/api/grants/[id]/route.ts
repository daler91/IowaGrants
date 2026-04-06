import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { GRANT_INCLUDE } from "@/lib/constants";
import { logError } from "@/lib/errors";
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
    if (body[field] !== undefined) {
      (data as Record<string, unknown>)[field] = body[field]!.trim();
    }
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

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const grant = await prisma.grant.findUnique({
      where: { id },
      include: GRANT_INCLUDE,
    });

    if (!grant) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    return NextResponse.json(grant);
  } catch (error) {
    logError("grants-api", "Failed to fetch grant", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request);

    const result = await parseJson(request, grantUpdateSchema);
    if (result.error) return result.error;

    const { id } = await params;

    const existing = await prisma.grant.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    const body = result.data;
    const { data, parsedDeadline } = buildUpdateData(body);

    if (parsedDeadline.error) {
      return NextResponse.json({ error: parsedDeadline.error }, { status: 400 });
    }

    if (parsedDeadline.shouldSet) {
      data.deadline = parsedDeadline.value;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await prisma.grant.update({
      where: { id },
      data,
      include: GRANT_INCLUDE,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "A grant with this source URL already exists" },
        { status: 409 },
      );
    }
    logError("grants-api", "Failed to update grant", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
