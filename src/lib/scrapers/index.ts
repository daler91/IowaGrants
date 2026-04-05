import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { log, logError, logWarn } from "@/lib/errors";
import { fetchSamGov } from "./sam-gov";
import { scrapeIEDA } from "./ieda-scraper";
import { fetchSimplerGrants } from "./simpler-grants";
import { scrapeUSDA } from "./usda-iowa";
import { scrapeOpportunityIowa } from "./opportunity-iowa";
import { scrapeIowaGrantsGov } from "./iowa-grants-gov";
import { searchWebForGrants } from "./web-search";
import { fetchAirtableGrants } from "./airtable-grants";
import { scrapeArticleGrants } from "./article-grants";
import { fetchGrantsGovApi } from "./grants-gov-api";
import { fetchFoundationGrants } from "./foundation-grants";
import { scrapeIowaLocalGrants } from "./iowa-local-grants";
import { scrapeRssFeeds } from "./rss-feeds";
import { scrapeSbaGov } from "./sba-gov";
import { scrapeCommunityFoundations } from "./community-foundations";
import { scrapeFederalAgencySbir } from "./federal-agency-sbir";
import { scrapeIowaIedaPrograms } from "./iowa-ieda-programs";
import {
  normalizeTitle,
  isExcludedByEligibility,
  isNonGrantProgram,
  isNonApplicationContent,
  validateDeadline,
  cleanHtmlToText,
} from "./utils";
import { findAllDateCandidates } from "./parsing-utils";
import { categorizeAll } from "@/lib/ai/categorizer";
import { parsePdfFromUrl } from "@/lib/ai/pdf-parser";
import { validateGrants } from "@/lib/ai/grant-validator";
import { extractDeadlinesWithAI } from "@/lib/ai/deadline-extractor";
import {
  checkForChanges,
  getUrlsNeedingReparse,
  markReparsed,
} from "@/lib/change-detection/detector";
import type { GrantData, ScraperResult } from "@/lib/types";

async function ensureEligibleExpenses() {
  const expenses = [
    { name: "EQUIPMENT", label: "Equipment Purchases" },
    { name: "FACADE_IMPROVEMENT", label: "Facade Improvement / Commercial Real Estate" },
    { name: "JOB_CREATION", label: "Job Creation / Hiring" },
    { name: "TECHNOLOGY", label: "Technology & Software Upgrades" },
    { name: "WORKING_CAPITAL", label: "Working Capital" },
    { name: "RESEARCH_DEVELOPMENT", label: "Research & Development" },
    { name: "MARKETING_EXPORT", label: "Marketing & Export" },
  ];

  await Promise.all(
    expenses.map((expense) =>
      prisma.eligibleExpense.upsert({
        where: { name: expense.name },
        update: { label: expense.label },
        create: expense,
      }),
    ),
  );
}

async function findExistingGrant(grant: GrantData) {
  const existing = await prisma.grant.findUnique({
    where: { sourceUrl: grant.sourceUrl },
  });
  if (existing) return existing;

  const normalized = normalizeTitle(grant.title);
  if (normalized.length > 10) {
    const titleDup = await prisma.grant.findFirst({
      where: { title: { equals: grant.title, mode: "insensitive" } },
    });
    if (titleDup) return titleDup; // treat as "exists" for skip purposes
  }
  return null;
}

async function upsertGrant(grant: GrantData): Promise<boolean> {
  // Sanitize deadline before DB write — catches wildly invalid years (e.g. 50315)
  const sanitizedDeadline = validateDeadline(grant.deadline);
  if (grant.deadline && !sanitizedDeadline) {
    logWarn("orchestrator", `Dropped invalid deadline for "${grant.title}"`, {
      deadline: grant.deadline.toISOString(),
    });
  }
  grant.deadline = sanitizedDeadline;

  const categoryConnections =
    grant.categories.length > 0
      ? {
          connectOrCreate: grant.categories.map((name) => ({
            where: { name },
            create: { name },
          })),
        }
      : undefined;

  const expenseConnections =
    grant.eligibleExpenses.length > 0
      ? {
          connect: grant.eligibleExpenses.map((name) => ({ name })),
        }
      : undefined;

  const existing = await findExistingGrant(grant);

  // Title-only duplicate (no matching sourceUrl) — skip entirely
  if (existing && existing.sourceUrl !== grant.sourceUrl) {
    log("orchestrator", "Skipping title duplicate", {
      title: grant.title,
      existingSource: existing.sourceName,
    });
    return false;
  }

  if (existing) {
    await prisma.grant.update({
      where: { sourceUrl: grant.sourceUrl },
      data: {
        title: grant.title,
        description: grant.description,
        amount: grant.amount,
        amountMin: grant.amountMin,
        amountMax: grant.amountMax,
        deadline: grant.deadline,
        eligibility: grant.eligibility,
        grantType: grant.grantType,
        status: grant.status,
        businessStage: grant.businessStage,
        gender: grant.gender,
        locations: grant.locations,
        industries: grant.industries,
        pdfUrl: grant.pdfUrl,
        rawData: grant.rawData ? (grant.rawData as Prisma.InputJsonValue) : undefined,
        lastVerified: new Date(),
        categories: categoryConnections ? { set: [], ...categoryConnections } : undefined,
        eligibleExpenses: expenseConnections ? { set: [], ...expenseConnections } : undefined,
      },
    });
    return false; // updated, not new
  }

  await prisma.grant.create({
    data: {
      title: grant.title,
      description: grant.description,
      sourceUrl: grant.sourceUrl,
      sourceName: grant.sourceName,
      amount: grant.amount,
      amountMin: grant.amountMin,
      amountMax: grant.amountMax,
      deadline: grant.deadline,
      eligibility: grant.eligibility,
      grantType: grant.grantType,
      status: grant.status,
      businessStage: grant.businessStage,
      gender: grant.gender,
      locations: grant.locations,
      industries: grant.industries,
      pdfUrl: grant.pdfUrl,
      rawData: grant.rawData ? (grant.rawData as Prisma.InputJsonValue) : undefined,
      categories: categoryConnections,
      eligibleExpenses: expenseConnections,
    },
  });
  return true; // new grant
}

function collectSourceResults(
  sourceResults: Array<{ name: string; result: PromiseSettledResult<GrantData[]> }>,
  results: ScraperResult[],
): GrantData[] {
  const allGrants: GrantData[] = [];
  for (const { name, result } of sourceResults) {
    if (result.status === "fulfilled") {
      allGrants.push(...result.value);
      results.push({ source: name, grants: result.value });
    } else {
      logError("orchestrator", `${name} failed`, result.reason);
      results.push({
        source: name,
        grants: [],
        error: result.reason?.message || "Unknown error",
      });
    }
  }
  return allGrants;
}

async function processPdfGrants(allGrants: GrantData[], urlsToReparse: string[]): Promise<void> {
  // Parse any PDFs that need reparsing
  for (const url of urlsToReparse) {
    if (url.endsWith(".pdf")) {
      const parsed = await parsePdfFromUrl(url, "pdf-parse");
      if (parsed) {
        allGrants.push(parsed);
      }
      await markReparsed(url);
    }
  }

  // Also parse PDFs found by scrapers
  for (let i = 0; i < allGrants.length; i++) {
    const grant = allGrants[i];
    if (grant.pdfUrl) {
      const parsed = await parsePdfFromUrl(grant.pdfUrl, grant.sourceName);
      if (parsed) {
        allGrants[i] = mergeGrantWithPdfParse(grant, parsed);
      }
    }
  }
}

/**
 * Merge a PDF-parsed grant into an HTML-scraped grant. Prefer the parsed
 * (PDF/AI) values for most fields, but never let a null/undefined parsed
 * deadline wipe out a real HTML-extracted deadline — and prefer the later
 * date when both exist (grants typically have a future application
 * deadline, not the document's original publish date).
 */
function mergeGrantWithPdfParse(original: GrantData, parsed: GrantData): GrantData {
  let deadline: Date | undefined = parsed.deadline ?? original.deadline;
  if (original.deadline && parsed.deadline) {
    deadline =
      parsed.deadline.getTime() >= original.deadline.getTime()
        ? parsed.deadline
        : original.deadline;
  }

  return {
    ...parsed,
    deadline,
    sourceUrl: original.sourceUrl,
    sourceName: original.sourceName,
    // Preserve original rawData fields (e.g. articlePage) by merging instead of replacing
    rawData: { ...(original.rawData ?? {}), ...(parsed.rawData ?? {}) },
  };
}

/**
 * Reconcile deadlines across scraped grants using AI.
 *
 * Regex-based extraction is fast but frequently picks the wrong date
 * (posted dates, event dates, past cycles). This step runs Claude over
 * grants where the regex result is suspect — missing, in the past, or
 * contradicted by a date found inside the description body — and replaces
 * the deadline with the AI result when confidence is high enough.
 *
 * Provenance is written into `grant.rawData.deadlineSource` for debugging.
 */
async function reconcileDeadlines(grants: GrantData[]): Promise<void> {
  if (grants.length === 0) return;

  const now = Date.now();
  const indicesToCheck: number[] = [];

  for (let i = 0; i < grants.length; i++) {
    const g = grants[i];
    const deadlineMissing = !g.deadline;
    const deadlinePast = !!g.deadline && g.deadline.getTime() < now;

    if (deadlineMissing || deadlinePast) {
      indicesToCheck.push(i);
      continue;
    }

    // Regex sanity check: does the description mention a date that disagrees
    // with the stored deadline? If so, ask the AI to adjudicate.
    const haystack = `${g.title} ${g.description} ${g.eligibility ?? ""}`;
    const candidates = findAllDateCandidates(haystack);
    if (candidates.length > 0 && g.deadline) {
      const stored = g.deadline.getTime();
      const dayMs = 24 * 60 * 60 * 1000;
      const hasDisagreement = candidates.some((c) => Math.abs(c.getTime() - stored) > dayMs);
      if (hasDisagreement) indicesToCheck.push(i);
    }
  }

  if (indicesToCheck.length === 0) {
    log("orchestrator", "Deadline reconcile: no grants need AI check");
    return;
  }

  log("orchestrator", "Deadline reconcile: running AI check", {
    candidates: indicesToCheck.length,
    totalGrants: grants.length,
  });

  const subset = indicesToCheck.map((i) => grants[i]);
  const extracted = await extractDeadlinesWithAI(subset);

  let overwritten = 0;
  let filledEmpty = 0;
  let disagreementsKept = 0;

  for (let k = 0; k < indicesToCheck.length; k++) {
    const i = indicesToCheck[k];
    const result = extracted[k];
    if (!result) continue;

    const grant = grants[i];
    const regexDeadlineIso = grant.deadline?.toISOString() ?? null;
    const aiDeadlineIso = result.deadline?.toISOString() ?? null;

    let method: "regex" | "ai" | "merged" = "regex";

    if (result.confidence === "HIGH" && result.deadline) {
      grant.deadline = result.deadline;
      method = "ai";
      overwritten++;
    } else if (result.confidence === "MEDIUM" && result.deadline && !grant.deadline) {
      grant.deadline = result.deadline;
      method = "ai";
      filledEmpty++;
    } else if (result.confidence === "MEDIUM" && result.deadline && grant.deadline) {
      method = "merged";
      disagreementsKept++;
      logWarn("orchestrator", `Deadline disagreement kept regex value for "${grant.title}"`, {
        regex: regexDeadlineIso,
        ai: aiDeadlineIso,
        reason: result.reason,
      });
    }

    grant.rawData = {
      ...(grant.rawData ?? {}),
      deadlineSource: {
        method,
        confidence: result.confidence,
        reason: result.reason,
        regexValue: regexDeadlineIso,
        aiValue: aiDeadlineIso,
      },
    };
  }

  log("orchestrator", "Deadline reconcile complete", {
    checked: indicesToCheck.length,
    overwritten,
    filledEmpty,
    disagreementsKept,
  });
}

async function upsertAndLog(
  allGrants: GrantData[],
  results: ScraperResult[],
  blacklistedUrls: Set<string>,
): Promise<number> {
  let totalNew = 0;
  const newCountBySource: Record<string, number> = {};

  for (const grant of allGrants) {
    if (blacklistedUrls.has(grant.sourceUrl)) {
      log("orchestrator", "Skipping blacklisted URL", { url: grant.sourceUrl });
      continue;
    }
    try {
      const isNew = await upsertGrant(grant);
      if (isNew) {
        totalNew++;
        newCountBySource[grant.sourceName] = (newCountBySource[grant.sourceName] || 0) + 1;
      }
    } catch (error) {
      logError("orchestrator", `Error upserting "${grant.title}"`, error);
    }
  }

  for (const result of results) {
    await prisma.scrapeLog.create({
      data: {
        source: result.source,
        status: result.error ? "error" : "success",
        grantsFound: result.grants.length,
        grantsNew: newCountBySource[result.source] || 0,
        error: result.error,
        completedAt: new Date(),
      },
    });
  }

  return totalNew;
}

export async function runFullScrape(scrapeRunId?: string): Promise<ScraperResult[]> {
  log("orchestrator", "Starting full scrape...");
  const results: ScraperResult[] = [];

  // Ensure eligible expense categories exist
  await ensureEligibleExpenses();

  // Step 1: Check for website changes
  await checkForChanges();

  // Step 2: Fetch from all sources in parallel
  const [
    samGov,
    ieda,
    simplerGrants,
    usda,
    opportunityIowa,
    iowaGrantsGov,
    webSearch,
    airtableGrants,
    articleGrants,
    grantsGovApi,
    foundationGrants,
    iowaLocalGrants,
    rssFeeds,
    sbaGov,
    communityFoundations,
    federalAgencySbir,
    iowaIedaPrograms,
  ] = await Promise.allSettled([
    fetchSamGov(),
    scrapeIEDA(),
    fetchSimplerGrants(),
    scrapeUSDA(),
    scrapeOpportunityIowa(),
    scrapeIowaGrantsGov(),
    searchWebForGrants(),
    fetchAirtableGrants(),
    scrapeArticleGrants(),
    fetchGrantsGovApi(),
    fetchFoundationGrants(),
    scrapeIowaLocalGrants(),
    scrapeRssFeeds(),
    scrapeSbaGov(),
    scrapeCommunityFoundations(),
    scrapeFederalAgencySbir(),
    scrapeIowaIedaPrograms(),
  ]);

  const sourceResults: Array<{ name: string; result: PromiseSettledResult<GrantData[]> }> = [
    { name: "sam.gov", result: samGov },
    { name: "ieda", result: ieda },
    { name: "simpler-grants", result: simplerGrants },
    { name: "usda-rd", result: usda },
    { name: "opportunity-iowa", result: opportunityIowa },
    { name: "iowa-grants-gov", result: iowaGrantsGov },
    { name: "web-search", result: webSearch },
    { name: "airtable-grants", result: airtableGrants },
    { name: "article-grants", result: articleGrants },
    { name: "grants-gov-api", result: grantsGovApi },
    { name: "foundation-grants", result: foundationGrants },
    { name: "iowa-local", result: iowaLocalGrants },
    { name: "rss-feeds", result: rssFeeds },
    { name: "sba-gov", result: sbaGov },
    { name: "community-foundations", result: communityFoundations },
    { name: "federal-agency-sbir", result: federalAgencySbir },
    { name: "iowa-ieda-programs", result: iowaIedaPrograms },
  ];

  // Step 2b: Collect results from all sources
  const allGrants = collectSourceResults(sourceResults, results);

  // Step 2c: Sanitize descriptions that contain HTML artifacts
  for (const grant of allGrants) {
    if (/<[a-z][\s\S]*>/i.test(grant.description)) {
      grant.description = cleanHtmlToText(grant.description);
    }
  }

  // Step 3 & 4: Parse PDFs (reparsing + scraper-found)
  const urlsToReparse = await getUrlsNeedingReparse();
  await processPdfGrants(allGrants, urlsToReparse);

  // Step 4b: Reconcile deadlines — use Claude to correct regex misses / wrong-cycle dates
  await reconcileDeadlines(allGrants);

  // Step 5: Run categorizer on all grants
  const categorized = categorizeAll(allGrants);

  // Step 5b: Apply grant filters in a single pass
  const filters: Array<{
    name: string;
    test: (grant: GrantData) => boolean;
  }> = [
    {
      name: "eligibility",
      test: (g) => {
        const text = `${g.title} ${g.description} ${g.eligibility || ""}`;
        return !isExcludedByEligibility(text);
      },
    },
    {
      name: "non-grant program",
      test: (g) => {
        const text = `${g.title} ${g.description} ${g.eligibility || ""}`;
        return !isNonGrantProgram(text);
      },
    },
    {
      name: "non-application content",
      test: (g) => {
        const result = isNonApplicationContent(g.title, g.description, g.sourceUrl);
        return !result.excluded;
      },
    },
  ];

  let applicationFiltered = categorized;
  for (const filter of filters) {
    const before = applicationFiltered.length;
    applicationFiltered = applicationFiltered.filter((grant) => {
      const passes = filter.test(grant);
      if (!passes) {
        log("orchestrator", `Filtered by ${filter.name}`, { title: grant.title });
      }
      return passes;
    });
    if (before !== applicationFiltered.length) {
      log("orchestrator", `${filter.name} filter: ${before} → ${applicationFiltered.length}`);
    }
  }

  // Step 5c: AI-powered validation for ALL grants (filters non-real grants and wrong eligibility)
  const validated = await validateGrants(applicationFiltered);

  // Step 6: Load blacklisted URLs
  const blacklistedUrls = new Set(
    (await prisma.blacklistedUrl.findMany({ select: { url: true } })).map((b) => b.url),
  );
  if (blacklistedUrls.size > 0) {
    log("orchestrator", "Loaded blacklisted URLs", { count: blacklistedUrls.size });
  }

  // Step 7: Upsert all grants and log results
  const totalNew = await upsertAndLog(validated, results, blacklistedUrls);

  // Update ScrapeRun record with final counts
  if (scrapeRunId) {
    await prisma.scrapeRun.update({
      where: { id: scrapeRunId },
      data: { grantsNew: totalNew, grantsFound: allGrants.length },
    });
  }

  log("orchestrator", "Done", { totalGrants: allGrants.length, newGrants: totalNew });
  return results;
}
