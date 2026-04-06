import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod/v4";

export async function parseJson<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
): Promise<{ data: T; error?: never } | { data?: never; error: NextResponse }> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { error: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      error: NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      ),
    };
  }

  return { data: parsed.data };
}
