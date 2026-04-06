import { NextRequest, NextResponse } from "next/server";

/** Uniform error response with optional machine-readable code and request correlation. */
export function errorResponse(
  request: NextRequest,
  status: number,
  error: string,
  code?: string,
): NextResponse {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  return NextResponse.json(
    { error, ...(code && { code }), ...(requestId && { requestId }) },
    { status },
  );
}

/**
 * Standardized error extraction — replaces the inconsistent mix of:
 *   error instanceof Error ? error.message : error
 *   error instanceof Error ? error.message : "Unknown error"
 *   result.reason?.message || "Unknown error"
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

/**
 * Structured log entry for consistent logging across all modules.
 * Replaces the inconsistent prefix patterns like [orchestrator], [pdf-parser], etc.
 */
export function log(module: string, message: string, data?: Record<string, unknown>) {
  const entry = {
    module,
    message,
    timestamp: new Date().toISOString(),
    ...data,
  };
  console.log(JSON.stringify(entry));
}

export function logError(
  module: string,
  message: string,
  error?: unknown,
  data?: Record<string, unknown>,
) {
  const entry = {
    module,
    message,
    error: error ? getErrorMessage(error) : undefined,
    timestamp: new Date().toISOString(),
    ...data,
  };
  console.error(JSON.stringify(entry));
}

export function logWarn(module: string, message: string, data?: Record<string, unknown>) {
  const entry = {
    module,
    message,
    timestamp: new Date().toISOString(),
    ...data,
  };
  console.warn(JSON.stringify(entry));
}
