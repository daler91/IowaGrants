import { jsPDF } from "jspdf";
import type { GrantFilters } from "@/lib/types";

/**
 * A grant row as returned by `/api/grants/export`. Derived from Prisma's
 * Grant model with included relations — kept loose so the formatters don't
 * take a dependency on the generated Prisma types.
 */
export interface GrantExportRow {
  id: string;
  title: string;
  description: string;
  sourceName: string;
  sourceUrl: string;
  grantType: string;
  status: string;
  gender: string;
  businessStage: string;
  amount?: string | null;
  deadline?: string | null;
  eligibility?: string | null;
  locations: string[];
  industries?: string[];
  pdfUrl?: string | null;
  eligibleExpenses: { name: string; label: string }[];
  categories?: { name: string; label?: string }[];
}

export type ExportFormat = "pdf" | "csv" | "json" | "text";

export interface ExportResult {
  filename: string;
  mimeType: string;
  blob: Blob;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function todayStamp(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDeadline(deadline: string | null | undefined): string {
  if (!deadline) return "No deadline";
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return "No deadline";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const FILTER_LABELS: Record<string, string> = {
  grantType: "Grant Type",
  gender: "Demographics",
  businessStage: "Business Stage",
  status: "Status",
  eligibleExpense: "Use of Funds",
  location: "Location",
  industry: "Industry",
  amountMin: "Amount Min",
  amountMax: "Amount Max",
};

function prettyValue(value: string): string {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build a short, human-readable summary of the active filters. Used in the
 * UI above the download button and as a header inside the exported PDF and
 * formatted-text outputs.
 */
export function buildFilterSummary(filters: GrantFilters, search: string): string {
  const parts: string[] = [];
  if (search) parts.push(`Search = "${search}"`);
  for (const key of Object.keys(FILTER_LABELS) as (keyof typeof FILTER_LABELS)[]) {
    const raw = (filters as Record<string, unknown>)[key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (Array.isArray(raw)) {
      if (raw.length === 0) continue;
      const rendered = raw.map((v) => prettyValue(String(v))).join(", ");
      parts.push(`${FILTER_LABELS[key]} = ${rendered}`);
    } else {
      parts.push(`${FILTER_LABELS[key]} = ${prettyValue(String(raw))}`);
    }
  }
  return parts.length === 0 ? "No filters (all grants)" : parts.join(" • ");
}

// ── JSON ─────────────────────────────────────────────────────────────────

export function toJSON(grants: GrantExportRow[]): ExportResult {
  const body = JSON.stringify(grants, null, 2);
  return {
    filename: `iowa-grants-${todayStamp()}.json`,
    mimeType: "application/json",
    blob: new Blob([body], { type: "application/json" }),
  };
}

// ── CSV ──────────────────────────────────────────────────────────────────

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // RFC 4180: wrap in quotes if it contains comma, quote, newline, or CR.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCSV(grants: GrantExportRow[]): ExportResult {
  const headers = [
    "Title",
    "Type",
    "Status",
    "Amount",
    "Deadline",
    "Business Stage",
    "Demographics",
    "Locations",
    "Eligible Expenses",
    "Source Name",
    "Source URL",
    "Description",
  ];

  const rows = grants.map((g) => [
    g.title,
    g.grantType,
    g.status,
    g.amount ?? "",
    formatDeadline(g.deadline),
    g.businessStage,
    g.gender,
    g.locations.join("; "),
    g.eligibleExpenses.map((e) => e.label).join("; "),
    g.sourceName,
    g.sourceUrl,
    g.description,
  ]);

  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(","));
  const body = lines.join("\r\n");

  return {
    filename: `iowa-grants-${todayStamp()}.csv`,
    mimeType: "text/csv",
    blob: new Blob([body], { type: "text/csv;charset=utf-8" }),
  };
}

// ── Formatted text (email-friendly) ──────────────────────────────────────

/**
 * Produce a plain-text export suitable for pasting into an email or chat.
 * The string is returned alongside the ExportResult so the UI can surface
 * it in a textarea (for "copy to clipboard" + mailto:) without re-reading
 * the Blob.
 */
export function toText(
  grants: GrantExportRow[],
  filterSummary: string,
): ExportResult & { text: string } {
  const sorted = sortForDecisionMaking(grants);
  const stats = buildSummaryStats(sorted);
  const lines: string[] = [];
  const sep = "═".repeat(60);
  const thinSep = "─".repeat(60);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // ── Header ──
  lines.push(sep);
  lines.push("          IOWA GRANTS — OPPORTUNITY REPORT");
  lines.push(sep);
  lines.push(`  Date:      ${today}`);
  lines.push(`  Filters:   ${filterSummary}`);
  lines.push(`  Grants:    ${stats.total} total`);
  lines.push("");

  // ── Executive Summary ──
  lines.push("  QUICK SUMMARY");
  lines.push(`    Open:          ${stats.openCount} grant${stats.openCount === 1 ? "" : "s"}`);
  lines.push(`    Forecasted:    ${stats.forecastedCount} grant${stats.forecastedCount === 1 ? "" : "s"}`);
  lines.push(`    Closed:        ${stats.closedCount} grant${stats.closedCount === 1 ? "" : "s"}`);
  if (stats.closingSoon.length > 0) {
    lines.push(`    Closing soon:  ${stats.closingSoon.length} grant${stats.closingSoon.length === 1 ? "" : "s"} (within 30 days)`);
  }
  lines.push("");
  const typeParts = Object.entries(stats.byType).map(([t, c]) => `${prettyValue(t)} (${c})`);
  if (typeParts.length) {
    lines.push(`    By type:  ${typeParts.join(" | ")}`);
    lines.push("");
  }

  // ── Closing Soon callout ──
  if (stats.closingSoon.length > 0) {
    lines.push("  CLOSING SOON — ACTION REQUIRED");
    for (const g of stats.closingSoon) {
      const days = daysUntil(g.deadline!);
      lines.push(`    • "${g.title}" — Apply by ${formatDeadline(g.deadline)} (${days} day${days === 1 ? "" : "s"})`);
    }
    lines.push("");
  }

  lines.push(sep);
  lines.push("");

  // ── Per-grant cards ──
  sorted.forEach((g, i) => {
    lines.push(thinSep);
    lines.push(`  ${i + 1}. ${g.title}`);
    lines.push(`     ${prettyValue(g.grantType)}  |  ${prettyValue(g.status)}  |  ${prettyValue(g.businessStage)}`);
    lines.push(thinSep);

    const urgency = deadlineUrgency(g.deadline);
    const deadlineStr = formatDeadline(g.deadline) + (urgency ? ` [${urgency}]` : "");
    lines.push(`  Deadline:      ${deadlineStr}`);
    if (g.amount) lines.push(`  Amount:        ${g.amount}`);
    if (g.locations.length) lines.push(`  Locations:     ${g.locations.join(", ")}`);
    if (g.eligibleExpenses.length) {
      lines.push(`  Use of Funds:  ${g.eligibleExpenses.map((e) => e.label).join(", ")}`);
    }
    if (g.gender && g.gender !== "ANY" && g.gender !== "GENERAL") {
      lines.push(`  Focus:         ${prettyValue(g.gender)}`);
    }
    lines.push("");

    if (g.eligibility) {
      lines.push("  Eligibility:");
      const wrapped = softWrap(g.eligibility, 72);
      for (const wline of wrapped) lines.push(`    ${wline}`);
      lines.push("");
    }

    const cats = formatCategories(g.categories);
    if (cats) lines.push(`  Categories:    ${cats}`);
    if (g.industries && g.industries.length) {
      lines.push(`  Industries:    ${g.industries.join(", ")}`);
    }
    if (cats || (g.industries && g.industries.length)) lines.push("");

    lines.push("  Description:");
    const wrapped = softWrap(g.description, 72);
    for (const wline of wrapped) lines.push(`    ${wline}`);
    lines.push("");

    lines.push(`  Source:      ${g.sourceName}`);
    lines.push(`  Link:        ${g.sourceUrl}`);
    if (g.pdfUrl) lines.push(`  Apply PDF:   ${g.pdfUrl}`);
    lines.push("");
  });

  // ── Footer ──
  lines.push(sep);
  lines.push(`  End of report — ${stats.total} grant${stats.total === 1 ? "" : "s"} exported`);
  lines.push(`  Generated by Iowa Grants on ${today}`);
  lines.push(sep);

  const text = lines.join("\n");
  return {
    filename: `iowa-grants-${todayStamp()}.txt`,
    mimeType: "text/plain",
    blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
    text,
  };
}

// ── Decision-making helpers ────────────────────────────────────────────

const STATUS_SORT_ORDER: Record<string, number> = { OPEN: 0, FORECASTED: 1, CLOSED: 2 };

function sortForDecisionMaking(grants: GrantExportRow[]): GrantExportRow[] {
  return [...grants].sort((a, b) => {
    const sa = STATUS_SORT_ORDER[a.status] ?? 9;
    const sb = STATUS_SORT_ORDER[b.status] ?? 9;
    if (sa !== sb) return sa - sb;
    // Within same status, sort by deadline ascending (nulls last)
    const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    return da - db;
  });
}

interface SummaryStats {
  total: number;
  openCount: number;
  forecastedCount: number;
  closedCount: number;
  closingSoon: GrantExportRow[];
  byType: Record<string, number>;
}

function buildSummaryStats(grants: GrantExportRow[]): SummaryStats {
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const stats: SummaryStats = {
    total: grants.length,
    openCount: 0,
    forecastedCount: 0,
    closedCount: 0,
    closingSoon: [],
    byType: {},
  };
  for (const g of grants) {
    if (g.status === "OPEN") stats.openCount++;
    else if (g.status === "FORECASTED") stats.forecastedCount++;
    else if (g.status === "CLOSED") stats.closedCount++;

    stats.byType[g.grantType] = (stats.byType[g.grantType] ?? 0) + 1;

    if (g.status === "OPEN" && g.deadline) {
      const dl = new Date(g.deadline).getTime();
      if (!Number.isNaN(dl) && dl >= now && dl - now <= thirtyDays) {
        stats.closingSoon.push(g);
      }
    }
  }
  // Sort closing-soon by deadline ascending
  stats.closingSoon.sort((a, b) => {
    return new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime();
  });
  return stats;
}

function deadlineUrgency(deadline: string | null | undefined): string | null {
  if (!deadline) return null;
  const dl = new Date(deadline).getTime();
  if (Number.isNaN(dl)) return null;
  const days = Math.ceil((dl - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return "EXPIRED";
  if (days <= 7) return "THIS WEEK";
  if (days <= 14) return "NEXT WEEK";
  if (days <= 30) return "THIS MONTH";
  if (days <= 60) return "UPCOMING";
  return null;
}

function daysUntil(deadline: string): number {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function formatCategories(categories?: { name: string; label?: string }[]): string {
  if (!categories || categories.length === 0) return "";
  return categories.map((c) => c.label ?? prettyValue(c.name)).join(", ");
}

function softWrap(input: string, width: number): string[] {
  const words = input.split(/\s+/);
  const out: string[] = [];
  let current = "";
  for (const w of words) {
    if (!current) {
      current = w;
    } else if ((current + " " + w).length > width) {
      out.push(current);
      current = w;
    } else {
      current += " " + w;
    }
  }
  if (current) out.push(current);
  return out;
}

// ── PDF ──────────────────────────────────────────────────────────────────

// Tailwind palette → hex mapping for the classes referenced in
// TYPE_COLORS / STATUS_COLORS. We draw filled pill badges directly, so we
// just need fill + text colors per badge type.
type PillColor = { fill: [number, number, number]; text: [number, number, number] };

const TYPE_PILL_COLORS: Record<string, PillColor> = {
  FEDERAL: { fill: [219, 234, 254], text: [30, 64, 175] }, // blue-100 / blue-800
  STATE: { fill: [220, 252, 231], text: [22, 101, 52] }, // green-100 / green-800
  LOCAL: { fill: [255, 237, 213], text: [154, 52, 18] }, // orange-100 / orange-800
  PRIVATE: { fill: [243, 232, 255], text: [107, 33, 168] }, // purple-100 / purple-800
};

const STATUS_PILL_COLORS: Record<string, PillColor> = {
  OPEN: { fill: [209, 250, 229], text: [6, 95, 70] }, // emerald-100 / emerald-800
  CLOSED: { fill: [254, 226, 226], text: [153, 27, 27] }, // red-100 / red-800
  FORECASTED: { fill: [254, 243, 199], text: [146, 64, 14] }, // amber-100 / amber-800
};

const DEFAULT_PILL: PillColor = { fill: [243, 244, 246], text: [55, 65, 81] };

export function toPDF(grants: GrantExportRow[], filterSummary: string): ExportResult {
  const sorted = sortForDecisionMaking(grants);
  const stats = buildSummaryStats(sorted);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin - 20) {
      doc.addPage();
      y = margin;
    }
  };

  const drawPill = (label: string, x: number, top: number, colors: PillColor): number => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    const textWidth = doc.getTextWidth(label);
    const padX = 6;
    const padY = 4;
    const h = 14;
    const w = textWidth + padX * 2;
    doc.setFillColor(colors.fill[0], colors.fill[1], colors.fill[2]);
    doc.roundedRect(x, top, w, h, 4, 4, "F");
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
    doc.text(label, x + padX, top + h - padY - 1);
    return w;
  };

  // ── Header ────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(30, 64, 175); // primary blue
  doc.text("Iowa Grants — Opportunity Report", margin, y);
  y += 26;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-500
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(`Generated: ${today}`, margin, y);
  y += 14;

  const filterLines = doc.splitTextToSize(`Filters: ${filterSummary}`, contentWidth) as string[];
  doc.text(filterLines, margin, y);
  y += filterLines.length * 12 + 4;

  // Divider
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  // ── Executive Summary Box ────────────────────────────────
  const summaryBoxTop = y;
  const summaryPadding = 12;

  // Pre-calculate box content height
  let summaryContentH = 0;
  summaryContentH += 16; // "Executive Summary" heading
  summaryContentH += 14; // status line
  summaryContentH += 14; // type line
  if (stats.closingSoon.length > 0) summaryContentH += 16; // closing soon line
  const boxH = summaryContentH + summaryPadding * 2;

  // Draw background
  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(margin, summaryBoxTop, contentWidth, boxH, 6, 6, "F");
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, summaryBoxTop, contentWidth, boxH, 6, 6, "S");

  y = summaryBoxTop + summaryPadding;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text("Executive Summary", margin + summaryPadding, y + 10);
  y += 18;

  // Status breakdown
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85); // slate-700
  const statusLine = `${stats.total} grants total:  ${stats.openCount} Open  |  ${stats.forecastedCount} Forecasted  |  ${stats.closedCount} Closed`;
  doc.text(statusLine, margin + summaryPadding, y + 10);
  y += 14;

  // Type breakdown
  const typeParts = Object.entries(stats.byType)
    .map(([t, c]) => `${prettyValue(t)} (${c})`)
    .join("  |  ");
  doc.text(`By type:  ${typeParts}`, margin + summaryPadding, y + 10);
  y += 14;

  // Closing soon callout
  if (stats.closingSoon.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(146, 64, 14); // amber-800
    doc.text(
      `${stats.closingSoon.length} grant${stats.closingSoon.length === 1 ? "" : "s"} closing within 30 days — action required`,
      margin + summaryPadding,
      y + 10,
    );
    y += 16;
  }

  y = summaryBoxTop + boxH + 16;

  // ── Grant Index (if >10 grants) ──────────────────────────
  if (sorted.length > 10) {
    ensureSpace(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text("Grant Index", margin, y);
    y += 16;

    doc.setFontSize(8);
    for (let i = 0; i < sorted.length; i++) {
      ensureSpace(11);
      const g = sorted[i];
      const indexStatus = prettyValue(g.status);
      const indexDeadline = formatDeadline(g.deadline);
      const indexLine = `${i + 1}. ${g.title}`;
      const truncTitle = indexLine.length > 55 ? indexLine.slice(0, 52) + "..." : indexLine;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.text(truncTitle, margin, y);

      // Status in its color
      const sColors = STATUS_PILL_COLORS[g.status] ?? DEFAULT_PILL;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(sColors.text[0], sColors.text[1], sColors.text[2]);
      doc.text(indexStatus, margin + 290, y);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(indexDeadline, margin + 370, y);
      y += 11;
    }

    y += 10;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(1);
    doc.line(margin, y, pageWidth - margin, y);
    y += 16;
  }

  // ── Per-grant cards ──────────────────────────────────────
  const labelCol = margin + 16;
  const valueCol = margin + 100;
  const cardContentWidth = contentWidth - 32;

  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];

    ensureSpace(120);

    // ── Card background ──
    const cardTop = y - 6;
    // We'll draw the background after calculating height — use a bookmark approach
    // For simplicity, draw a light background first with estimated height, then overlay text
    const estimatedCardH = 140 + (g.eligibility ? 40 : 0) + (g.categories?.length ? 14 : 0) + (g.industries?.length ? 14 : 0);
    doc.setFillColor(249, 250, 251); // gray-50
    doc.roundedRect(margin - 4, cardTop, contentWidth + 8, Math.min(estimatedCardH, pageHeight - margin - cardTop - 20), 6, 6, "F");

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42); // slate-900
    const titleLines = doc.splitTextToSize(`${i + 1}. ${g.title}`, contentWidth - 16) as string[];
    doc.text(titleLines, margin + 8, y);
    y += titleLines.length * 16;

    // Pills: type + status + urgency
    const typeColors = TYPE_PILL_COLORS[g.grantType] ?? DEFAULT_PILL;
    const statusColors = STATUS_PILL_COLORS[g.status] ?? DEFAULT_PILL;
    let pillX = margin + 8;
    const pillY = y;
    pillX += drawPill(prettyValue(g.grantType), pillX, pillY, typeColors) + 6;
    pillX += drawPill(prettyValue(g.status), pillX, pillY, statusColors) + 6;

    const urgency = deadlineUrgency(g.deadline);
    if (urgency) {
      const urgencyColor: PillColor =
        urgency === "EXPIRED"
          ? { fill: [254, 226, 226], text: [153, 27, 27] }
          : urgency === "THIS WEEK" || urgency === "NEXT WEEK"
            ? { fill: [254, 243, 199], text: [146, 64, 14] }
            : { fill: [219, 234, 254], text: [30, 64, 175] };
      drawPill(urgency, pillX, pillY, urgencyColor);
    }
    y += 22;

    // Meta rows
    doc.setFontSize(10);

    const metaRow = (label: string, value: string) => {
      ensureSpace(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text(`${label}:`, labelCol, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85); // slate-700
      const valueLines = doc.splitTextToSize(value, cardContentWidth - 90) as string[];
      doc.text(valueLines, valueCol, y);
      y += valueLines.length * 13;
    };

    // Deadline with urgency highlight
    const deadlineDisplay = formatDeadline(g.deadline);
    if (urgency && (urgency === "THIS WEEK" || urgency === "NEXT WEEK" || urgency === "EXPIRED")) {
      ensureSpace(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(71, 85, 105);
      doc.text("Deadline:", labelCol, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(146, 64, 14); // amber-800 for urgency
      doc.text(deadlineDisplay, valueCol, y);
      y += 13;
    } else {
      metaRow("Deadline", deadlineDisplay);
    }

    if (g.amount) metaRow("Amount", g.amount);
    metaRow("Stage", prettyValue(g.businessStage));
    if (g.gender && g.gender !== "ANY" && g.gender !== "GENERAL") {
      metaRow("Focus", prettyValue(g.gender));
    }
    if (g.locations.length) metaRow("Locations", g.locations.join(", "));
    if (g.eligibleExpenses.length) {
      metaRow("Use of Funds", g.eligibleExpenses.map((e) => e.label).join(", "));
    }

    // Eligibility
    if (g.eligibility) {
      y += 4;
      ensureSpace(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text("Eligibility", labelCol, y);
      y += 13;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      const eligLines = doc.splitTextToSize(g.eligibility, cardContentWidth) as string[];
      for (const line of eligLines) {
        ensureSpace(12);
        doc.text(line, labelCol, y);
        y += 12;
      }
    }

    // Categories & Industries
    const cats = formatCategories(g.categories);
    if (cats) metaRow("Categories", cats);
    if (g.industries && g.industries.length) metaRow("Industries", g.industries.join(", "));

    // Description
    y += 4;
    ensureSpace(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("Description", labelCol, y);
    y += 13;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105); // slate-600
    const descLines = doc.splitTextToSize(g.description, cardContentWidth) as string[];
    for (const line of descLines) {
      ensureSpace(12);
      doc.text(line, labelCol, y);
      y += 12;
    }

    // Source (clickable)
    y += 4;
    ensureSpace(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text("Source:", labelCol, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 64, 175); // link blue
    doc.text(g.sourceName, valueCol, y);
    y += 12;
    ensureSpace(14);
    const urlLines = doc.splitTextToSize(g.sourceUrl, cardContentWidth) as string[];
    for (const line of urlLines) {
      ensureSpace(12);
      doc.textWithLink(line, labelCol, y, { url: g.sourceUrl });
      y += 12;
    }

    // Application PDF link
    if (g.pdfUrl) {
      ensureSpace(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(71, 85, 105);
      doc.text("Apply PDF:", labelCol, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 64, 175);
      doc.textWithLink(g.pdfUrl, valueCol, y, { url: g.pdfUrl });
      y += 12;
    }

    // Separator between grants
    y += 12;
    if (i < sorted.length - 1) {
      ensureSpace(12);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 16;
    }
  }

  // Page footer with page numbers
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(
      `Iowa Grants — Opportunity Report  |  Page ${p} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 20,
      { align: "center" },
    );
  }

  const blob = doc.output("blob");
  return {
    filename: `iowa-grants-${todayStamp()}.pdf`,
    mimeType: "application/pdf",
    blob,
  };
}

// ── Download + mailto helpers ────────────────────────────────────────────

export function triggerDownload(result: ExportResult): void {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delay revoke so Safari/Firefox complete the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const MAILTO_MAX_BODY = 1800;

/**
 * Build a `mailto:` URL with the formatted-text export pre-populated in the
 * body. Bodies are truncated to ~1800 chars because most mail clients choke
 * on longer query strings.
 */
export function buildMailto(formattedText: string, grantCount: number): string {
  const subject = `Iowa Grants Export — ${grantCount} grant${grantCount === 1 ? "" : "s"}`;
  let body = formattedText;
  if (body.length > MAILTO_MAX_BODY) {
    body = body.slice(0, MAILTO_MAX_BODY) + "\n\n…(truncated — see attached export for full list)";
  }
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
