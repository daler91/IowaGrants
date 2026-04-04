import { z } from "zod/v4";

/**
 * Schema for a single validation result from the grant validator AI.
 * Validates the shape of each item in the JSON array returned by Claude.
 */
export const ValidationResultSchema = z.object({
  index: z.number().int(),
  is_real_grant: z.boolean(),
  small_biz_eligible: z.boolean(),
  content_type: z.enum([
    "grant_application",
    "awardee_announcement",
    "news_article",
    "info_page",
    "expired_program",
    "other",
  ]),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  reason: z.string(),
});

export const ValidationResultArraySchema = z.array(ValidationResultSchema);

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

/**
 * Schema for parsed grant data from PDF/text AI extraction.
 * Validates the JSON object returned by Claude when parsing grant documents.
 */
export const ParsedGrantSchema = z.object({
  title: z.string(),
  description: z.string(),
  amountMin: z.number().nullable(),
  amountMax: z.number().nullable(),
  deadline: z.string().nullable(),
  eligibility: z.string().nullable(),
  grantType: z.string(),
  businessStage: z.string(),
  gender: z.string(),
  locations: z.array(z.string()),
  industries: z.array(z.string()),
  eligibleExpenses: z.array(z.string()),
  categories: z.array(z.string()),
});

export type ParsedGrant = z.infer<typeof ParsedGrantSchema>;
