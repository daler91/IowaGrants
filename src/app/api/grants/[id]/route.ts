import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";

const VALID_GRANT_TYPES = ["FEDERAL", "STATE", "LOCAL", "PRIVATE"];
const VALID_GENDER_FOCUS = ["WOMEN", "VETERAN", "MINORITY", "GENERAL", "ANY"];
const VALID_BUSINESS_STAGE = ["STARTUP", "EXISTING", "BOTH"];
const VALID_GRANT_STATUS = ["OPEN", "CLOSED", "FORECASTED"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const grant = await prisma.grant.findUnique({
      where: { id },
      include: {
        categories: true,
        eligibleExpenses: true,
      },
    });

    if (!grant) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    return NextResponse.json(grant);
  } catch (error) {
    console.error("Failed to fetch grant:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id } = await params;

  const existing = await prisma.grant.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Grant not found" }, { status: 404 });
  }

  const data: Prisma.GrantUpdateInput = {};
  const errors: string[] = [];

  // Required string fields (cannot be empty if provided)
  for (const field of ["title", "description", "sourceName", "sourceUrl"] as const) {
    if (field in body) {
      const val = body[field];
      if (typeof val !== "string" || val.trim().length === 0) {
        errors.push(`${field} must be a non-empty string`);
      } else {
        (data as Record<string, unknown>)[field] = val.trim();
      }
    }
  }

  // Optional string fields (can be cleared by sending empty string or null)
  for (const field of ["amount", "eligibility", "pdfUrl"] as const) {
    if (field in body) {
      const val = body[field];
      if (val === null || val === "") {
        (data as Record<string, unknown>)[field] = null;
      } else if (typeof val === "string") {
        (data as Record<string, unknown>)[field] = val.trim();
      } else {
        errors.push(`${field} must be a string or null`);
      }
    }
  }

  // Integer fields
  for (const field of ["amountMin", "amountMax"] as const) {
    if (field in body) {
      const val = body[field];
      if (val === null) {
        (data as Record<string, unknown>)[field] = null;
      } else if (typeof val === "number" && Number.isInteger(val) && val >= 0) {
        (data as Record<string, unknown>)[field] = val;
      } else {
        errors.push(`${field} must be a non-negative integer or null`);
      }
    }
  }

  // Deadline
  if ("deadline" in body) {
    const val = body.deadline;
    if (val === null) {
      data.deadline = null;
    } else if (typeof val === "string") {
      const date = new Date(val);
      if (Number.isNaN(date.getTime())) {
        errors.push("deadline must be a valid date string or null");
      } else {
        data.deadline = date;
      }
    } else {
      errors.push("deadline must be a date string or null");
    }
  }

  // Enum fields
  if ("grantType" in body) {
    if (VALID_GRANT_TYPES.includes(body.grantType as string)) {
      data.grantType = body.grantType as Prisma.EnumGrantTypeFieldUpdateOperationsInput["set"];
    } else {
      errors.push(`grantType must be one of: ${VALID_GRANT_TYPES.join(", ")}`);
    }
  }

  if ("status" in body) {
    if (VALID_GRANT_STATUS.includes(body.status as string)) {
      data.status = body.status as Prisma.EnumGrantStatusFieldUpdateOperationsInput["set"];
    } else {
      errors.push(`status must be one of: ${VALID_GRANT_STATUS.join(", ")}`);
    }
  }

  if ("businessStage" in body) {
    if (VALID_BUSINESS_STAGE.includes(body.businessStage as string)) {
      data.businessStage = body.businessStage as Prisma.EnumBusinessStageFieldUpdateOperationsInput["set"];
    } else {
      errors.push(`businessStage must be one of: ${VALID_BUSINESS_STAGE.join(", ")}`);
    }
  }

  if ("gender" in body) {
    if (VALID_GENDER_FOCUS.includes(body.gender as string)) {
      data.gender = body.gender as Prisma.EnumGenderFocusFieldUpdateOperationsInput["set"];
    } else {
      errors.push(`gender must be one of: ${VALID_GENDER_FOCUS.join(", ")}`);
    }
  }

  // String array fields
  for (const field of ["locations", "industries"] as const) {
    if (field in body) {
      const val = body[field];
      if (Array.isArray(val) && val.every((v) => typeof v === "string")) {
        (data as Record<string, unknown>)[field] = val.map((v: string) => v.trim()).filter((v: string) => v.length > 0);
      } else {
        errors.push(`${field} must be an array of strings`);
      }
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.grant.update({
      where: { id },
      data,
      include: {
        categories: true,
        eligibleExpenses: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "A grant with this source URL already exists" },
        { status: 409 },
      );
    }
    console.error("Failed to update grant:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
