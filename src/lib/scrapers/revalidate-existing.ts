import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { log, logError } from "@/lib/errors";
import type { GrantData } from "@/lib/types";
import { validateGrants } from "@/lib/ai/grant-validator";
import { checkUrlHealth } from "./url-health";
import { AI_CALL_DELAY_MS } from "./config";

export interface RevalidateOptions {
  /** Maximum number of grants to check in this sweep. Defaults to 200. */
  limit?: number;
}

export interface RevalidateSummary {
  checked: number;
  closed: number;
  kept: number;
  errors: number;
}

const BATCH_SIZE = 8;

/**
 * Sweep existing OPEN grants in the DB and close any whose source URL is
 * dead or whose live content no longer represents a real small-business
 * grant. Grants are processed oldest-lastVerified first so successive calls
 * rotate through the full database.
 *
 * Closing is non-destructive: the record is kept with status=CLOSED and a
 * `rawData.closedReason` entry explaining why.
 */
export async function revalidateExistingGrants(
  options: RevalidateOptions = {},
): Promise<RevalidateSummary> {
  const limit = options.limit ?? 200;
  const summary: RevalidateSummary = { checked: 0, closed: 0, kept: 0, errors: 0 };

  const grants = await prisma.grant.findMany({
    where: { status: "OPEN" },
    orderBy: { lastVerified: "asc" },
    take: limit,
  });

  if (grants.length === 0) {
    log("revalidate-existing", "No OPEN grants to revalidate");
    return summary;
  }

  log("revalidate-existing", "Starting sweep", { count: grants.length });

  for (let i = 0; i < grants.length; i += BATCH_SIZE) {
    const batch = grants.slice(i, i + BATCH_SIZE);

    // Step 1: URL health in parallel
    const healthResults = await Promise.all(
      batch.map(async (g) => ({ grant: g, health: await checkUrlHealth(g.sourceUrl) })),
    );

    // Step 2: Dead URLs → close immediately
    const aliveEntries: Array<{
      grant: (typeof batch)[number];
      bodyText: string;
    }> = [];

    for (const { grant, health } of healthResults) {
      summary.checked++;
      if (health.alive) {
        aliveEntries.push({ grant, bodyText: health.bodyText });
      } else {
        try {
          await closeGrant(grant.id, grant.rawData, {
            method: "url-health",
            status: health.status ?? null,
            reason: health.reason,
          });
          summary.closed++;
          log("revalidate-existing", "Closed dead URL", {
            id: grant.id,
            title: grant.title,
            url: grant.sourceUrl,
            status: health.status,
            reason: health.reason,
          });
        } catch (error) {
          summary.errors++;
          logError("revalidate-existing", "Failed to close grant", error, { id: grant.id });
        }
      }
    }

    // Step 3: Alive grants → run AI validator against live content
    if (aliveEntries.length > 0) {
      const projections: GrantData[] = aliveEntries.map(({ grant, bodyText }) =>
        toGrantData(grant, bodyText),
      );

      let validated: GrantData[];
      try {
        validated = await validateGrants(projections);
      } catch (error) {
        // Fail-open on unexpected validator errors: keep the grants and just
        // refresh lastVerified so we don't churn on them.
        summary.errors++;
        logError("revalidate-existing", "Validator threw, keeping batch", error);
        validated = projections;
      }

      const survivingUrls = new Set(validated.map((g) => g.sourceUrl));

      for (const { grant } of aliveEntries) {
        if (survivingUrls.has(grant.sourceUrl)) {
          try {
            await prisma.grant.update({
              where: { id: grant.id },
              data: { lastVerified: new Date() },
            });
            summary.kept++;
          } catch (error) {
            summary.errors++;
            logError("revalidate-existing", "Failed to touch lastVerified", error, {
              id: grant.id,
            });
          }
        } else {
          try {
            await closeGrant(grant.id, grant.rawData, {
              method: "ai-revalidation",
              reason: "AI classified live content as non-grant / expired",
            });
            summary.closed++;
            log("revalidate-existing", "Closed by AI revalidation", {
              id: grant.id,
              title: grant.title,
              url: grant.sourceUrl,
            });
          } catch (error) {
            summary.errors++;
            logError("revalidate-existing", "Failed to close grant", error, { id: grant.id });
          }
        }
      }
    }

    if (i + BATCH_SIZE < grants.length) {
      await new Promise((r) => setTimeout(r, AI_CALL_DELAY_MS));
    }
  }

  log("revalidate-existing", "Sweep complete", { ...summary });
  return summary;
}

async function closeGrant(
  id: string,
  existingRawData: Prisma.JsonValue | null,
  closedReason: {
    method: "url-health" | "ai-revalidation";
    status?: number | null;
    reason?: string;
  },
): Promise<void> {
  const base =
    existingRawData && typeof existingRawData === "object" && !Array.isArray(existingRawData)
      ? (existingRawData as Record<string, unknown>)
      : {};
  // Strip transient liveBodyText so we don't persist a 4KB text blob.
  const { liveBodyText: _, ...rest } = base;
  const nextRaw: Record<string, unknown> = {
    ...rest,
    closedReason: {
      ...closedReason,
      at: new Date().toISOString(),
    },
  };

  await prisma.grant.update({
    where: { id },
    data: {
      status: "CLOSED",
      rawData: nextRaw as Prisma.InputJsonValue,
      lastVerified: new Date(),
    },
  });
}

function toGrantData(
  grant: {
    title: string;
    description: string;
    sourceUrl: string;
    sourceName: string;
    amount: string | null;
    amountMin: number | null;
    amountMax: number | null;
    deadline: Date | null;
    eligibility: string | null;
    grantType: GrantData["grantType"];
    status: GrantData["status"];
    businessStage: GrantData["businessStage"];
    gender: GrantData["gender"];
    locations: string[];
    industries: string[];
    pdfUrl: string | null;
    rawData: Prisma.JsonValue | null;
  },
  liveBodyText: string,
): GrantData {
  const baseRaw =
    grant.rawData && typeof grant.rawData === "object" && !Array.isArray(grant.rawData)
      ? (grant.rawData as Record<string, unknown>)
      : {};
  return {
    title: grant.title,
    description: grant.description,
    sourceUrl: grant.sourceUrl,
    sourceName: grant.sourceName,
    amount: grant.amount ?? undefined,
    amountMin: grant.amountMin ?? undefined,
    amountMax: grant.amountMax ?? undefined,
    deadline: grant.deadline ?? undefined,
    eligibility: grant.eligibility ?? undefined,
    grantType: grant.grantType,
    status: grant.status,
    businessStage: grant.businessStage,
    gender: grant.gender,
    locations: grant.locations,
    industries: grant.industries,
    pdfUrl: grant.pdfUrl ?? undefined,
    rawData: { ...baseRaw, liveBodyText },
    categories: [],
    eligibleExpenses: [],
  };
}
