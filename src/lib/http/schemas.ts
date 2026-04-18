import { z } from "zod/v4";
import {
  VALID_GRANT_TYPES,
  VALID_GENDER_FOCUS,
  VALID_BUSINESS_STAGE,
  VALID_GRANT_STATUS,
} from "@/lib/constants";
import { validateExternalUrl } from "@/lib/http/url-validation";

// ── Auth ────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email("A valid email address is required"),
  password: z.string().min(12, "Password must be at least 12 characters"),
});

export const registerSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(12, "Password must be at least 12 characters"),
  name: z.string().optional(),
});

// ── Admin Invites ───────────────────────────────────────────────────────

export const inviteSchema = z.object({
  email: z
    .string()
    .min(1)
    .check(
      z.refine((email) => {
        const trimmed = email.trim();
        const atIdx = trimmed.indexOf("@");
        return (
          atIdx > 0 &&
          !trimmed.includes("@", atIdx + 1) &&
          trimmed.indexOf(".", atIdx + 2) > atIdx &&
          !trimmed.includes(" ") &&
          trimmed.length <= 254
        );
      }, "A valid email address is required"),
    ),
});

// ── Blacklist ───────────────────────────────────────────────────────────

export const blacklistPostSchema = z.object({
  urls: z.array(z.string()).min(1),
  reason: z.string().optional(),
});

// ── Shared delete-by-IDs ────────────────────────────────────────────────

export const deleteIdsSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
});

// ── Admin Revalidate ───────────────────────────────────────────────────

export const revalidateSchema = z.object({
  limit: z.number().int().min(1).max(1000).optional().default(200),
});

// ── Grant Update (PUT /api/grants/[id]) ─────────────────────────────────

const grantTypeEnum = z.enum(VALID_GRANT_TYPES as [string, ...string[]]);
const grantStatusEnum = z.enum(VALID_GRANT_STATUS as [string, ...string[]]);
const businessStageEnum = z.enum(VALID_BUSINESS_STAGE as [string, ...string[]]);
const genderFocusEnum = z.enum(VALID_GENDER_FOCUS as [string, ...string[]]);

const safeUrlString = z
  .string()
  .min(1, "URL must be a non-empty string")
  .check(
    z.refine((value) => validateExternalUrl(value).ok, {
      message: "URL must use http(s) and not point to a private or metadata host",
    }),
  );

export const grantUpdateSchema = z.object({
  // Required string fields — non-empty when provided
  title: z.string().min(1, "title must be a non-empty string").optional(),
  description: z.string().min(1, "description must be a non-empty string").optional(),
  sourceName: z.string().min(1, "sourceName must be a non-empty string").optional(),
  sourceUrl: safeUrlString.optional(),

  // Optional string fields (nullable)
  amount: z.union([z.string(), z.null()]).optional(),
  eligibility: z.union([z.string(), z.null()]).optional(),
  pdfUrl: z.union([safeUrlString, z.null()]).optional(),

  // Integer fields (nullable)
  amountMin: z.union([z.number().int().min(0), z.null()]).optional(),
  amountMax: z.union([z.number().int().min(0), z.null()]).optional(),

  // Deadline (nullable date string)
  deadline: z.union([z.string(), z.null()]).optional(),

  // Enum fields
  grantType: grantTypeEnum.optional(),
  status: grantStatusEnum.optional(),
  businessStage: businessStageEnum.optional(),
  gender: genderFocusEnum.optional(),

  // String arrays
  locations: z.array(z.string()).optional(),
  industries: z.array(z.string()).optional(),
});
