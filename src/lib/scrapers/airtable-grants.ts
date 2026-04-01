import axios from "axios";
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { GrantData } from "@/lib/types";
import { cleanHtmlToText, detectLocationScope, isExcludedByStateRestriction } from "./utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AirtableFieldMapping {
  /** Possible column names for the grant title */
  title: string[];
  /** Possible column names for the description */
  description: string[];
  /** Possible column names for the grant URL / link */
  sourceUrl: string[];
  /** Possible column names for the dollar amount */
  amount: string[];
  /** Possible column names for the deadline */
  deadline: string[];
  /** Possible column names for eligibility info */
  eligibility: string[];
}

interface AirtableSource {
  name: string;
  sourceName: string;
  baseId: string;
  tableId: string;
  sharedViewId: string;
  sourcePageUrl: string;
  fieldMapping: AirtableFieldMapping;
  defaults: Pick<GrantData, "grantType" | "status" | "businessStage" | "gender" | "locations" | "industries" | "categories" | "eligibleExpenses">;
}

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Source configuration
// ---------------------------------------------------------------------------

const DEFAULT_FIELD_MAPPING: AirtableFieldMapping = {
  title: ["Name", "Grant Name", "Title", "Grant", "Program Name", "Organization"],
  description: ["Description", "Details", "About", "Summary", "Notes", "Info"],
  sourceUrl: ["Link", "URL", "Website", "Apply Link", "Application Link", "Apply", "Grant Link"],
  amount: ["Amount", "Award", "Award Amount", "Grant Amount", "Funding", "Prize", "Max Award"],
  deadline: ["Deadline", "Due Date", "Close Date", "Closing Date", "End Date", "Expires", "Application Deadline"],
  eligibility: ["Eligibility", "Who Can Apply", "Requirements", "Eligible", "Qualifications", "Who is Eligible"],
};

const AIRTABLE_SOURCES: AirtableSource[] = [
  {
    name: "ladies-who-launch",
    sourceName: "ladies-who-launch",
    baseId: process.env.LWL_AIRTABLE_BASE_ID || "appWOyoayT1shujGM",
    tableId: process.env.LWL_AIRTABLE_TABLE_NAME || "tbluTVoKAfaUQk6uG",
    sharedViewId: process.env.LWL_AIRTABLE_VIEW_ID || "shruHZuhBtjY8LY4I",
    sourcePageUrl: "https://www.ladieswholaunch.org/small-business-grants",
    fieldMapping: DEFAULT_FIELD_MAPPING,
    defaults: {
      grantType: "PRIVATE",
      status: "OPEN",
      businessStage: "BOTH",
      gender: "WOMEN",
      locations: ["Nationwide"],
      industries: [],
      categories: [],
      eligibleExpenses: [],
    },
  },
];

// ---------------------------------------------------------------------------
// Field matching helpers
// ---------------------------------------------------------------------------

function findField(fields: Record<string, unknown>, candidates: string[]): unknown | undefined {
  // Try exact match first
  for (const name of candidates) {
    if (name in fields) return fields[name];
  }
  // Try case-insensitive match
  const lower = Object.entries(fields);
  for (const name of candidates) {
    const found = lower.find(([k]) => k.toLowerCase() === name.toLowerCase());
    if (found) return found[1];
  }
  // Try partial match (column name contains candidate or vice versa)
  for (const name of candidates) {
    const found = lower.find(
      ([k]) => k.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(k.toLowerCase())
    );
    if (found) return found[1];
  }
  return undefined;
}

function fieldToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(fieldToString).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ---------------------------------------------------------------------------
// Amount parsing
// ---------------------------------------------------------------------------

function parseAmounts(amountStr: string): { amount?: string; amountMin?: number; amountMax?: number } {
  if (!amountStr) return {};

  const cleaned = amountStr.replace(/,/g, "");

  // Range: "$5,000 - $50,000" or "$5k-$50k"
  const rangeMatch = cleaned.match(/\$?([\d.]+)\s*[kK]?\s*[-–—to]+\s*\$?([\d.]+)\s*[kK]?/);
  if (rangeMatch) {
    let min = parseFloat(rangeMatch[1]);
    let max = parseFloat(rangeMatch[2]);
    if (amountStr.toLowerCase().includes("k")) {
      if (min < 1000) min *= 1000;
      if (max < 1000) max *= 1000;
    }
    return { amount: amountStr.trim(), amountMin: min, amountMax: max };
  }

  // "Up to $X" or "Up to $Xk"
  const upToMatch = cleaned.match(/up\s+to\s+\$?([\d.]+)\s*[kK]?/i);
  if (upToMatch) {
    let max = parseFloat(upToMatch[1]);
    if (amountStr.toLowerCase().includes("k") && max < 1000) max *= 1000;
    return { amount: amountStr.trim(), amountMax: max };
  }

  // Single amount: "$10,000" or "$10k"
  const singleMatch = cleaned.match(/\$?([\d.]+)\s*[kK]?/);
  if (singleMatch) {
    let val = parseFloat(singleMatch[1]);
    if (amountStr.toLowerCase().includes("k") && val < 1000) val *= 1000;
    return { amount: amountStr.trim(), amountMin: val, amountMax: val };
  }

  return { amount: amountStr.trim() };
}

// ---------------------------------------------------------------------------
// Deadline parsing
// ---------------------------------------------------------------------------

function parseDeadline(value: unknown): Date | undefined {
  if (!value) return undefined;

  const str = String(value).trim();

  // ISO date string from Airtable (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2024) return d;
  }

  // Natural language date (e.g., "March 15, 2026")
  const d = new Date(str);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 2024) return d;

  return undefined;
}

// ---------------------------------------------------------------------------
// Record → GrantData transform
// ---------------------------------------------------------------------------

function transformRecord(record: AirtableRecord, source: AirtableSource): GrantData | null {
  const { fields } = record;
  const { fieldMapping, defaults } = source;

  const title = fieldToString(findField(fields, fieldMapping.title)).trim();
  if (!title) return null;

  const rawDescription = fieldToString(findField(fields, fieldMapping.description));
  const description = cleanHtmlToText(rawDescription) || title;

  const rawUrl = fieldToString(findField(fields, fieldMapping.sourceUrl)).trim();
  // If URL is an array of URLs (Airtable can return arrays), take the first
  const sourceUrl = rawUrl.startsWith("http") ? rawUrl.split(/[,\s]/)[0] : source.sourcePageUrl;

  const rawAmount = fieldToString(findField(fields, fieldMapping.amount));
  const amounts = parseAmounts(rawAmount);

  const deadline = parseDeadline(findField(fields, fieldMapping.deadline));
  const eligibility = cleanHtmlToText(fieldToString(findField(fields, fieldMapping.eligibility)), 1000) || undefined;

  // Check for state restrictions in description + eligibility
  const fullText = `${description} ${eligibility || ""}`;
  if (isExcludedByStateRestriction(fullText)) return null;

  const locations = detectLocationScope(fullText);

  return {
    title,
    description,
    sourceUrl,
    sourceName: source.sourceName,
    ...amounts,
    deadline,
    eligibility,
    ...defaults,
    locations: locations.length > 0 ? locations : defaults.locations,
    rawData: fields as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Fetch via official Airtable API (requires AIRTABLE_API_KEY)
// ---------------------------------------------------------------------------

async function fetchViaApi(source: AirtableSource): Promise<AirtableRecord[]> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!apiKey) return [];

  const allRecords: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params: Record<string, string> = {};
    if (offset) params.offset = offset;

    const response = await axios.get(
      `https://api.airtable.com/v0/${source.baseId}/${source.tableId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": "IowaGrantScanner/1.0 (educational research project)",
        },
        params,
        timeout: 20000,
      }
    );

    const data = response.data as { records: AirtableRecord[]; offset?: string };
    allRecords.push(...data.records);
    offset = data.offset;

    // Respect Airtable rate limit (5 req/sec)
    if (offset) await new Promise((r) => setTimeout(r, 250));
  } while (offset);

  return allRecords;
}

// ---------------------------------------------------------------------------
// Fetch via shared view (no API key required)
// ---------------------------------------------------------------------------

async function fetchViaSharedView(source: AirtableSource): Promise<AirtableRecord[]> {
  const url = `https://airtable.com/${source.sharedViewId}`;

  const response = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    timeout: 30000,
    maxRedirects: 5,
  });

  const html = response.data as string;
  return extractRecordsFromSharedView(html);
}

/**
 * Parse the embedded JSON data from an Airtable shared view page.
 * Airtable inlines initial data in script tags as serialized JSON.
 */
function extractRecordsFromSharedView(html: string): AirtableRecord[] {
  const records: AirtableRecord[] = [];

  // Strategy 1: Look for window.__sharedViewData or similar inline JSON
  const dataPatterns = [
    /window\.__sharedViewData\s*=\s*({[\s\S]*?});/,
    /initData\s*[=:]\s*({[\s\S]*?});\s*<\/script>/,
    /"tableData"\s*:\s*({[\s\S]*?})\s*[,}]/,
    /"rows"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
  ];

  for (const pattern of dataPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      try {
        const data = JSON.parse(match[1]);
        const extracted = extractFromDataPayload(data);
        if (extracted.length > 0) return extracted;
      } catch {
        // Try next pattern
      }
    }
  }

  // Strategy 2: Look for JSON data in script tags using Cheerio
  const $page = cheerio.load(html);
  const scripts = $page("script").toArray();
  for (const script of scripts) {
    const content = $page(script).html() || "";

    // Look for large JSON objects that might contain table data
    const jsonMatches = content.match(/\{[^{}]*"rows"[^{}]*\[[\s\S]*?\]\s*[^{}]*\}/g);
    if (jsonMatches) {
      for (const jsonStr of jsonMatches) {
        try {
          const data = JSON.parse(jsonStr);
          const extracted = extractFromDataPayload(data);
          if (extracted.length > 0) {
            records.push(...extracted);
            break;
          }
        } catch {
          // Continue
        }
      }
      if (records.length > 0) break;
    }

    // Look for stringified JSON assigned to variables
    const assignmentMatch = content.match(/=\s*JSON\.parse\(["'](.+?)["']\)/);
    if (assignmentMatch?.[1]) {
      try {
        const decoded = assignmentMatch[1]
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/\\\\/g, "\\");
        const data = JSON.parse(decoded);
        const extracted = extractFromDataPayload(data);
        if (extracted.length > 0) {
          records.push(...extracted);
          break;
        }
      } catch {
        // Continue
      }
    }
  }

  // Strategy 3: Parse as a rendered HTML table (some shared views render server-side)
  if (records.length === 0) {
    const tableRecords = extractFromHtmlTable($page);
    if (tableRecords.length > 0) return tableRecords;
  }

  return records;
}

/**
 * Extract AirtableRecord[] from a parsed JSON data payload.
 * Handles various shapes of Airtable's internal data format.
 */
function extractFromDataPayload(data: Record<string, unknown>): AirtableRecord[] {
  // Direct records array
  if (Array.isArray(data)) {
    return data
      .filter((r) => r && typeof r === "object" && "fields" in r)
      .map((r) => ({ id: r.id || "", fields: r.fields }));
  }

  // Nested under .records
  if (data.records && Array.isArray(data.records)) {
    return extractFromDataPayload(data.records as unknown as Record<string, unknown>);
  }

  // Nested under .data.rows with column definitions
  if (data.rows && Array.isArray(data.rows) && data.columns && Array.isArray(data.columns)) {
    const columns = data.columns as Array<{ id?: string; name?: string; label?: string }>;
    const rows = data.rows as Array<{ id?: string; cellValues?: Record<string, unknown>; cells?: Record<string, unknown> }>;

    return rows.map((row) => {
      const fields: Record<string, unknown> = {};
      const values = row.cellValues || row.cells || {};

      for (const col of columns) {
        const colKey = col.id || col.name || "";
        const colName = col.name || col.label || colKey;
        if (colKey in values) {
          fields[colName] = values[colKey];
        }
      }

      return { id: row.id || "", fields };
    });
  }

  // Try nested tableData
  if (data.tableData && typeof data.tableData === "object") {
    return extractFromDataPayload(data.tableData as Record<string, unknown>);
  }

  // Try data.data
  if (data.data && typeof data.data === "object") {
    return extractFromDataPayload(data.data as Record<string, unknown>);
  }

  return [];
}

/**
 * Fallback: extract data from a server-rendered HTML table.
 */
function extractFromHtmlTable($: CheerioAPI): AirtableRecord[] {
  const records: AirtableRecord[] = [];
  const headers: string[] = [];

  // Find table headers
  $("table th, table thead td").each((_, th) => {
    headers.push($(th).text().trim());
  });

  if (headers.length === 0) return [];

  // Parse rows
  $("table tbody tr, table tr").each((i, tr) => {
    if (i === 0 && $(tr).find("th").length > 0) return; // skip header row

    const fields: Record<string, unknown> = {};
    $(tr).find("td").each((j, td) => {
      if (j < headers.length) {
        // Preserve links from anchor tags
        const link = $(td).find("a").first().attr("href");
        const text = $(td).text().trim();
        fields[headers[j]] = link && (headers[j].toLowerCase().includes("link") || headers[j].toLowerCase().includes("url"))
          ? link
          : text;
      }
    });

    if (Object.keys(fields).length > 0) {
      records.push({ id: `row-${i}`, fields });
    }
  });

  return records;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function fetchAirtableGrants(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];

  for (const source of AIRTABLE_SOURCES) {
    if (!source.baseId && !source.sharedViewId) {
      console.log(`[airtable:${source.name}] Skipping — no base ID or shared view ID configured`);
      continue;
    }

    try {
      let records: AirtableRecord[] = [];

      // Try official API first if key is available
      if (process.env.AIRTABLE_API_KEY) {
        console.log(`[airtable:${source.name}] Fetching via official API...`);
        records = await fetchViaApi(source);
      }

      // Fall back to shared view scraping
      if (records.length === 0 && source.sharedViewId) {
        console.log(`[airtable:${source.name}] Fetching via shared view...`);
        try {
          records = await fetchViaSharedView(source);
        } catch (error) {
          console.error(
            `[airtable:${source.name}] Shared view fetch failed:`,
            error instanceof Error ? error.message : error
          );
        }
      }

      if (records.length === 0) {
        console.log(`[airtable:${source.name}] No records found`);
        continue;
      }

      // Log field names from first record to help debug mapping
      if (records[0]?.fields) {
        console.log(
          `[airtable:${source.name}] Fields found: ${Object.keys(records[0].fields).join(", ")}`
        );
      }

      const seenUrls = new Set<string>();
      let transformed = 0;

      for (const record of records) {
        const grant = transformRecord(record, source);
        if (!grant) continue;
        if (seenUrls.has(grant.sourceUrl)) continue;
        seenUrls.add(grant.sourceUrl);
        allGrants.push(grant);
        transformed++;
      }

      console.log(
        `[airtable:${source.name}] ${records.length} records → ${transformed} grants`
      );
    } catch (error) {
      console.error(
        `[airtable:${source.name}] Error:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(`[airtable] Total grants from all sources: ${allGrants.length}`);
  return allGrants;
}
