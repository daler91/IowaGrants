import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchSamGov } from "./sam-gov";
import { scrapeIEDA } from "./ieda-scraper";
import { fetchShadowAPIs } from "./shadow-api-hunter";
import { fetchSimplerGrants } from "./simpler-grants";
import { scrapeUSDA } from "./usda-iowa";
import { scrapeOpportunityIowa } from "./opportunity-iowa";
import { scrapeIowaGrantsGov } from "./iowa-grants-gov";
import { searchWebForGrants } from "./web-search";
import { fetchAirtableGrants } from "./airtable-grants";
import { scrapeArticleGrants } from "./article-grants";
import { fetchGrantsGovApi } from "./grants-gov-api";
import { normalizeTitle } from "./utils";
import { categorizeAll } from "@/lib/ai/categorizer";
import { parsePdfFromUrl } from "@/lib/ai/pdf-parser";
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

  for (const expense of expenses) {
    await prisma.eligibleExpense.upsert({
      where: { name: expense.name },
      update: { label: expense.label },
      create: expense,
    });
  }
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
  const categoryConnections = grant.categories.length > 0
    ? {
        connectOrCreate: grant.categories.map((name) => ({
          where: { name },
          create: { name },
        })),
      }
    : undefined;

  const expenseConnections = grant.eligibleExpenses.length > 0
    ? {
        connect: grant.eligibleExpenses.map((name) => ({ name })),
      }
    : undefined;

  const existing = await findExistingGrant(grant);

  // Title-only duplicate (no matching sourceUrl) — skip entirely
  if (existing && existing.sourceUrl !== grant.sourceUrl) {
    console.log(`[orchestrator] Skipping title duplicate: "${grant.title}" (already from ${existing.sourceName})`);
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
        categories: categoryConnections
          ? { set: [], ...categoryConnections }
          : undefined,
        eligibleExpenses: expenseConnections
          ? { set: [], ...expenseConnections }
          : undefined,
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
      console.error(`[orchestrator] ${name} failed:`, result.reason);
      results.push({
        source: name,
        grants: [],
        error: result.reason?.message || "Unknown error",
      });
    }
  }
  return allGrants;
}

async function processPdfGrants(
  allGrants: GrantData[],
  urlsToReparse: string[],
): Promise<void> {
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
  const pdfGrants = allGrants.filter((g) => g.pdfUrl);
  for (const grant of pdfGrants) {
    if (grant.pdfUrl) {
      const parsed = await parsePdfFromUrl(grant.pdfUrl, grant.sourceName);
      if (parsed) {
        // Merge parsed data back - prefer AI-extracted data
        Object.assign(grant, {
          ...parsed,
          sourceUrl: grant.sourceUrl, // keep original URL as dedup key
          sourceName: grant.sourceName,
        });
      }
    }
  }
}

async function upsertAndLog(
  allGrants: GrantData[],
  results: ScraperResult[],
): Promise<number> {
  let totalNew = 0;
  for (const grant of allGrants) {
    try {
      const isNew = await upsertGrant(grant);
      if (isNew) totalNew++;
    } catch (error) {
      console.error(
        `[orchestrator] Error upserting "${grant.title}":`,
        error instanceof Error ? error.message : error
      );
    }
  }

  for (const result of results) {
    await prisma.scrapeLog.create({
      data: {
        source: result.source,
        status: result.error ? "error" : "success",
        grantsFound: result.grants.length,
        grantsNew: 0, // tracked at aggregate level
        error: result.error,
        completedAt: new Date(),
      },
    });
  }

  return totalNew;
}

export async function runFullScrape(): Promise<ScraperResult[]> {
  console.log("[orchestrator] Starting full scrape...");
  const results: ScraperResult[] = [];

  // Ensure eligible expense categories exist
  await ensureEligibleExpenses();

  // Step 1: Check for website changes
  await checkForChanges();

  // Step 2: Fetch from all sources in parallel
  const [samGov, ieda, shadow, simplerGrants, usda, opportunityIowa, iowaGrantsGov, webSearch, airtableGrants, articleGrants, grantsGovApi] = await Promise.allSettled([
    fetchSamGov(),
    scrapeIEDA(),
    fetchShadowAPIs(),
    fetchSimplerGrants(),
    scrapeUSDA(),
    scrapeOpportunityIowa(),
    scrapeIowaGrantsGov(),
    searchWebForGrants(),
    fetchAirtableGrants(),
    scrapeArticleGrants(),
    fetchGrantsGovApi(),
  ]);

  const sourceResults: Array<{ name: string; result: PromiseSettledResult<GrantData[]> }> = [
    { name: "sam.gov", result: samGov },
    { name: "ieda", result: ieda },
    { name: "shadow-api", result: shadow },
    { name: "simpler-grants", result: simplerGrants },
    { name: "usda-rd", result: usda },
    { name: "opportunity-iowa", result: opportunityIowa },
    { name: "iowa-grants-gov", result: iowaGrantsGov },
    { name: "web-search", result: webSearch },
    { name: "airtable-grants", result: airtableGrants },
    { name: "article-grants", result: articleGrants },
    { name: "grants-gov-api", result: grantsGovApi },
  ];

  // Step 2b: Collect results from all sources
  const allGrants = collectSourceResults(sourceResults, results);

  // Step 3 & 4: Parse PDFs (reparsing + scraper-found)
  const urlsToReparse = await getUrlsNeedingReparse();
  await processPdfGrants(allGrants, urlsToReparse);

  // Step 5: Run categorizer on all grants
  const categorized = categorizeAll(allGrants);

  // Step 6 & 7: Upsert all grants and log results
  const totalNew = await upsertAndLog(categorized, results);

  console.log(
    `[orchestrator] Done. ${allGrants.length} total grants, ${totalNew} new.`
  );
  return results;
}
