import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { GRANT_INCLUDE } from "@/lib/constants";
import { logError } from "@/lib/errors";
import { parseJson } from "@/lib/http/parse-json";
import { grantUpdateSchema } from "@/lib/http/schemas";

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
    const data: Prisma.GrantUpdateInput = {};

    // Required string fields — trim when provided
    for (const field of ["title", "description", "sourceName", "sourceUrl"] as const) {
      if (body[field] !== undefined) {
        (data as Record<string, unknown>)[field] = body[field]!.trim();
      }
    }

    // Optional string fields (nullable)
    for (const field of ["amount", "eligibility", "pdfUrl"] as const) {
      if (body[field] !== undefined) {
        const val = body[field];
        (data as Record<string, unknown>)[field] =
          val === null || val === "" ? null : val!.trim();
      }
    }

    // Integer fields
    for (const field of ["amountMin", "amountMax"] as const) {
      if (body[field] !== undefined) {
        (data as Record<string, unknown>)[field] = body[field];
      }
    }

    // Deadline
    if (body.deadline !== undefined) {
      if (body.deadline === null) {
        data.deadline = null;
      } else {
        const date = new Date(body.deadline);
        if (Number.isNaN(date.getTime())) {
          return NextResponse.json(
            { error: "deadline must be a valid date string or null" },
            { status: 400 },
          );
        }
        data.deadline = date;
      }
    }

    // Enum fields
    if (body.grantType !== undefined) {
      data.grantType = body.grantType as Prisma.EnumGrantTypeFieldUpdateOperationsInput["set"];
    }
    if (body.status !== undefined) {
      data.status = body.status as Prisma.EnumGrantStatusFieldUpdateOperationsInput["set"];
    }
    if (body.businessStage !== undefined) {
      data.businessStage = body.businessStage as Prisma.EnumBusinessStageFieldUpdateOperationsInput["set"];
    }
    if (body.gender !== undefined) {
      data.gender = body.gender as Prisma.EnumGenderFocusFieldUpdateOperationsInput["set"];
    }

    // String arrays — trim and filter empty
    for (const field of ["locations", "industries"] as const) {
      if (body[field] !== undefined) {
        (data as Record<string, unknown>)[field] = body[field]!
          .map((v: string) => v.trim())
          .filter((v: string) => v.length > 0);
      }
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
