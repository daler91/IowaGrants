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
    .replaceAll("_", " ")
    .toLowerCase()
    .replaceAll(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build a short, human-readable summary of the active filters. Used in the
 * UI above the download button and as a header inside the exported PDF and
 * formatted-text outputs.
 */
export function buildFilterSummary(filters: GrantFilters, search: string): string {
  const parts: string[] = [];
  if (search) parts.push(`Search = "${search}"`);
  for (const key of Object.keys(FILTER_LABELS)) {
    const raw = (filters as Record<string, string | string[] | undefined>)[key];
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

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // RFC 4180: wrap in quotes if it contains comma, quote, newline, or CR.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replaceAll('"', '""')}"`;
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
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // ── Compact header ──
  lines.push(
    "IOWA GRANT OPPORTUNITIES",
    "========================",
    `${today} | ${stats.total} grants | ${filterSummary}`,
    "",
  );

  // ── One-line summary ──
  const summaryParts = [`${stats.openCount} open`, `${stats.forecastedCount} forecasted`, `${stats.closedCount} closed`];
  if (stats.closingSoon.length > 0) {
    summaryParts.push(`${stats.closingSoon.length} closing soon`);
  }
  lines.push(`Summary: ${summaryParts.join(", ")}`, "");

  // ── Per-grant entries (compact) ──
  sorted.forEach((g, i) => {
    lines.push(
      `${i + 1}. ${g.title}`,
      `   ${prettyValue(g.grantType)} | ${prettyValue(g.status)} | ${prettyValue(g.businessStage)}`,
    );

    // Deadline with days remaining
    if (g.status === "OPEN" && g.deadline) {
      const days = daysUntil(g.deadline);
      if (days >= 0) {
        lines.push(`   Deadline: ${formatDeadline(g.deadline)} (${days} day${days === 1 ? "" : "s"} left)`);
      } else {
        lines.push(`   Deadline: ${formatDeadline(g.deadline)}`);
      }
    } else {
      lines.push(`   Deadline: ${formatDeadline(g.deadline)}`);
    }

    if (g.amount) lines.push(`   Amount: ${g.amount}`);

    // Eligibility — truncated to one line
    if (g.eligibility) {
      const elig = g.eligibility.replaceAll(/\s+/g, " ").trim();
      lines.push(`   Eligibility: ${elig.length > 120 ? elig.slice(0, 117) + "..." : elig}`);
    }

    // Brief description — one line
    const desc = g.description.replaceAll(/\s+/g, " ").trim();
    lines.push(`   ${desc.length > 120 ? desc.slice(0, 117) + "..." : desc}`);

    const linkLines = [`   Link: ${g.sourceUrl}`];
    if (g.pdfUrl) linkLines.push(`   Apply: ${g.pdfUrl}`);
    lines.push(...linkLines, "");
  });

  // ── Footer ──
  lines.push("---", "Full details in the attached PDF.");

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

const URGENCY_PILL_COLORS: Record<string, PillColor> = {
  EXPIRED: { fill: [254, 226, 226], text: [153, 27, 27] },
  "THIS WEEK": { fill: [254, 243, 199], text: [146, 64, 14] },
  "NEXT WEEK": { fill: [254, 243, 199], text: [146, 64, 14] },
};
const DEFAULT_URGENCY_PILL: PillColor = { fill: [219, 234, 254], text: [30, 64, 175] };

function getUrgencyColor(urgency: string): PillColor {
  return URGENCY_PILL_COLORS[urgency] ?? DEFAULT_URGENCY_PILL;
}

interface PDFContext {
  doc: jsPDF;
  y: number;
  margin: number;
  pageWidth: number;
  pageHeight: number;
  contentWidth: number;
}

function pdfEnsureSpace(ctx: PDFContext, needed: number): void {
  if (ctx.y + needed > ctx.pageHeight - ctx.margin - 20) {
    ctx.doc.addPage();
    ctx.y = ctx.margin;
  }
}

function pdfDrawPill(ctx: PDFContext, label: string, x: number, top: number, colors: PillColor): number {
  const { doc } = ctx;
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
}

function pdfRenderHeader(ctx: PDFContext, filterSummary: string): void {
  const { doc, margin, contentWidth } = ctx;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(30, 64, 175);
  doc.text("Grant Opportunities for Your Business", margin, ctx.y);
  ctx.y += 26;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(today, margin, ctx.y);
  ctx.y += 14;

  const filterLines = doc.splitTextToSize(`Filters: ${filterSummary}`, contentWidth) as string[];
  doc.text(filterLines, margin, ctx.y);
  ctx.y += filterLines.length * 12 + 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  const introText = "The following grants may be a good fit for your business. Each listing includes eligibility requirements, funding amounts, and deadlines to help you decide which to pursue.";
  const introLines = doc.splitTextToSize(introText, contentWidth) as string[];
  doc.text(introLines, margin, ctx.y);
  ctx.y += introLines.length * 14 + 8;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(1);
  doc.line(margin, ctx.y, ctx.pageWidth - margin, ctx.y);
  ctx.y += 16;
}

function pdfRenderSummaryBox(ctx: PDFContext, stats: SummaryStats): void {
  const { doc, margin, contentWidth } = ctx;
  const summaryBoxTop = ctx.y;
  const summaryPadding = 12;

  let summaryContentH = 44; // heading + status + type lines
  if (stats.closingSoon.length > 0) summaryContentH += 16;
  const boxH = summaryContentH + summaryPadding * 2;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, summaryBoxTop, contentWidth, boxH, 6, 6, "F");
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, summaryBoxTop, contentWidth, boxH, 6, 6, "S");

  ctx.y = summaryBoxTop + summaryPadding;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text("At a Glance", margin + summaryPadding, ctx.y + 10);
  ctx.y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `${stats.total} grants found:  ${stats.openCount} Open  |  ${stats.forecastedCount} Forecasted  |  ${stats.closedCount} Closed`,
    margin + summaryPadding,
    ctx.y + 10,
  );
  ctx.y += 14;

  const typeParts = Object.entries(stats.byType)
    .map(([t, c]) => `${prettyValue(t)} (${c})`)
    .join("  |  ");
  doc.text(`By type:  ${typeParts}`, margin + summaryPadding, ctx.y + 10);
  ctx.y += 14;

  if (stats.closingSoon.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(146, 64, 14);
    doc.text(
      `${stats.closingSoon.length} grant${stats.closingSoon.length === 1 ? "" : "s"} closing within 30 days`,
      margin + summaryPadding,
      ctx.y + 10,
    );
    ctx.y += 16;
  }

  ctx.y = summaryBoxTop + boxH + 16;
}

function pdfRenderIndex(ctx: PDFContext, sorted: GrantExportRow[]): void {
  if (sorted.length <= 20) return;

  const { doc, margin } = ctx;
  pdfEnsureSpace(ctx, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text("Grant Index", margin, ctx.y);
  ctx.y += 16;

  doc.setFontSize(8);
  for (let i = 0; i < sorted.length; i++) {
    pdfEnsureSpace(ctx, 11);
    const g = sorted[i];
    const indexLine = `${i + 1}. ${g.title}`;
    const truncTitle = indexLine.length > 55 ? indexLine.slice(0, 52) + "..." : indexLine;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    doc.text(truncTitle, margin, ctx.y);

    const sColors = STATUS_PILL_COLORS[g.status] ?? DEFAULT_PILL;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(sColors.text[0], sColors.text[1], sColors.text[2]);
    doc.text(prettyValue(g.status), margin + 290, ctx.y);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(formatDeadline(g.deadline), margin + 370, ctx.y);
    ctx.y += 11;
  }

  ctx.y += 10;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(1);
  doc.line(margin, ctx.y, ctx.pageWidth - margin, ctx.y);
  ctx.y += 16;
}

function pdfRenderGrantCard(ctx: PDFContext, g: GrantExportRow, index: number, isLast: boolean): void {
  const { doc, margin, contentWidth, pageHeight } = ctx;
  const labelCol = margin + 16;
  const valueCol = margin + 100;
  const cardContentWidth = contentWidth - 32;
  const DESC_MAX_CHARS = 180;

  pdfEnsureSpace(ctx, 120);

  const cardTop = ctx.y - 6;
  const estimatedCardH = 130 + (g.eligibility ? 36 : 0);
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(margin - 4, cardTop, contentWidth + 8, Math.min(estimatedCardH, pageHeight - margin - cardTop - 20), 6, 6, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(`${index + 1}. ${g.title}`, contentWidth - 16) as string[];
  doc.text(titleLines, margin + 8, ctx.y);
  ctx.y += titleLines.length * 16;

  // Pills
  const typeColors = TYPE_PILL_COLORS[g.grantType] ?? DEFAULT_PILL;
  const statusColors = STATUS_PILL_COLORS[g.status] ?? DEFAULT_PILL;
  let pillX = margin + 8;
  const pillY = ctx.y;
  pillX += pdfDrawPill(ctx, prettyValue(g.grantType), pillX, pillY, typeColors) + 6;
  pillX += pdfDrawPill(ctx, prettyValue(g.status), pillX, pillY, statusColors) + 6;

  const urgency = deadlineUrgency(g.deadline);
  if (urgency) {
    pdfDrawPill(ctx, urgency, pillX, pillY, getUrgencyColor(urgency));
  }
  ctx.y += 22;

  doc.setFontSize(10);

  const metaRow = (label: string, value: string) => {
    pdfEnsureSpace(ctx, 14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text(`${label}:`, labelCol, ctx.y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    const valueLines = doc.splitTextToSize(value, cardContentWidth - 90) as string[];
    doc.text(valueLines, valueCol, ctx.y);
    ctx.y += valueLines.length * 13;
  };

  pdfRenderDeadlineRow(ctx, g, urgency, labelCol, valueCol, metaRow);
  pdfRenderMetaRows(ctx, g, metaRow);
  pdfRenderEligibility(ctx, g, labelCol, cardContentWidth);
  pdfRenderDescription(ctx, g, labelCol, cardContentWidth, DESC_MAX_CHARS);
  pdfRenderApplySection(ctx, g, labelCol);

  ctx.y += 12;
  if (!isLast) {
    pdfEnsureSpace(ctx, 12);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(margin, ctx.y, ctx.pageWidth - margin, ctx.y);
    ctx.y += 16;
  }
}

function pdfRenderDeadlineRow(
  ctx: PDFContext,
  g: GrantExportRow,
  urgency: string | null,
  labelCol: number,
  valueCol: number,
  metaRow: (label: string, value: string) => void,
): void {
  const deadlineDisplay = formatDeadline(g.deadline);
  const isUrgent = urgency === "THIS WEEK" || urgency === "NEXT WEEK" || urgency === "EXPIRED";
  if (urgency && isUrgent) {
    pdfEnsureSpace(ctx, 14);
    ctx.doc.setFont("helvetica", "bold");
    ctx.doc.setTextColor(71, 85, 105);
    ctx.doc.text("Deadline:", labelCol, ctx.y);
    ctx.doc.setFont("helvetica", "bold");
    ctx.doc.setTextColor(146, 64, 14);
    ctx.doc.text(deadlineDisplay, valueCol, ctx.y);
    ctx.y += 13;
  } else {
    metaRow("Deadline", deadlineDisplay);
  }
}

function pdfRenderMetaRows(
  ctx: PDFContext,
  g: GrantExportRow,
  metaRow: (label: string, value: string) => void,
): void {
  if (g.amount) metaRow("Amount", g.amount);
  metaRow("Stage", prettyValue(g.businessStage));
  if (g.gender && g.gender !== "ANY" && g.gender !== "GENERAL") {
    metaRow("Focus", prettyValue(g.gender));
  }
  if (g.locations.length) metaRow("Locations", g.locations.join(", "));
  if (g.eligibleExpenses.length) {
    metaRow("Use of Funds", g.eligibleExpenses.map((e) => e.label).join(", "));
  }
  const cats = formatCategories(g.categories);
  if (cats) metaRow("Categories", cats);
  if (g.industries?.length) metaRow("Industries", g.industries.join(", "));
}

function pdfRenderEligibility(
  ctx: PDFContext,
  g: GrantExportRow,
  labelCol: number,
  cardContentWidth: number,
): void {
  if (!g.eligibility) return;
  ctx.y += 4;
  pdfEnsureSpace(ctx, 30);
  ctx.doc.setFont("helvetica", "bold");
  ctx.doc.setFontSize(10);
  ctx.doc.setTextColor(15, 23, 42);
  ctx.doc.text("Eligibility", labelCol, ctx.y);
  ctx.y += 13;
  ctx.doc.setFont("helvetica", "normal");
  ctx.doc.setTextColor(71, 85, 105);
  const eligLines = ctx.doc.splitTextToSize(g.eligibility, cardContentWidth) as string[];
  for (const line of eligLines) {
    pdfEnsureSpace(ctx, 12);
    ctx.doc.text(line, labelCol, ctx.y);
    ctx.y += 12;
  }
}

function pdfRenderDescription(
  ctx: PDFContext,
  g: GrantExportRow,
  labelCol: number,
  cardContentWidth: number,
  maxChars: number,
): void {
  ctx.y += 4;
  pdfEnsureSpace(ctx, 30);
  ctx.doc.setFont("helvetica", "normal");
  ctx.doc.setFontSize(10);
  ctx.doc.setTextColor(71, 85, 105);
  const rawDesc = g.description.replaceAll(/\s+/g, " ").trim();
  const truncDesc = rawDesc.length > maxChars ? rawDesc.slice(0, maxChars - 3) + "..." : rawDesc;
  const descLines = ctx.doc.splitTextToSize(truncDesc, cardContentWidth) as string[];
  for (const line of descLines) {
    pdfEnsureSpace(ctx, 12);
    ctx.doc.text(line, labelCol, ctx.y);
    ctx.y += 12;
  }
}

function pdfRenderApplySection(ctx: PDFContext, g: GrantExportRow, labelCol: number): void {
  ctx.y += 6;
  pdfEnsureSpace(ctx, 28);
  ctx.doc.setFont("helvetica", "bold");
  ctx.doc.setFontSize(10);
  ctx.doc.setTextColor(15, 23, 42);
  ctx.doc.text("How to Apply", labelCol, ctx.y);
  ctx.y += 13;

  ctx.doc.setFont("helvetica", "normal");
  ctx.doc.setFontSize(10);
  ctx.doc.setTextColor(30, 64, 175);

  if (g.pdfUrl) {
    pdfEnsureSpace(ctx, 12);
    ctx.doc.text("Download the application form:", labelCol, ctx.y);
    ctx.y += 12;
    pdfEnsureSpace(ctx, 12);
    const pdfUrlTrunc = g.pdfUrl.length > 80 ? g.pdfUrl.slice(0, 77) + "..." : g.pdfUrl;
    ctx.doc.textWithLink(pdfUrlTrunc, labelCol, ctx.y, { url: g.pdfUrl });
    ctx.y += 13;
  }

  pdfEnsureSpace(ctx, 12);
  ctx.doc.setTextColor(51, 65, 85);
  ctx.doc.text(`Visit ${g.sourceName} to learn more:`, labelCol, ctx.y);
  ctx.y += 12;
  pdfEnsureSpace(ctx, 12);
  ctx.doc.setTextColor(30, 64, 175);
  const srcUrlTrunc = g.sourceUrl.length > 80 ? g.sourceUrl.slice(0, 77) + "..." : g.sourceUrl;
  ctx.doc.textWithLink(srcUrlTrunc, labelCol, ctx.y, { url: g.sourceUrl });
  ctx.y += 12;
}

function pdfRenderFooter(ctx: PDFContext): void {
  const pageCount = ctx.doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    ctx.doc.setPage(p);
    ctx.doc.setFont("helvetica", "normal");
    ctx.doc.setFontSize(9);
    ctx.doc.setTextColor(148, 163, 184);
    ctx.doc.text(
      `Grant Opportunities  |  Page ${p} of ${pageCount}`,
      ctx.pageWidth / 2,
      ctx.pageHeight - 20,
      { align: "center" },
    );
  }
}

export function toPDF(grants: GrantExportRow[], filterSummary: string): ExportResult {
  const sorted = sortForDecisionMaking(grants);
  const stats = buildSummaryStats(sorted);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;

  const ctx: PDFContext = {
    doc,
    y: margin,
    margin,
    pageWidth,
    pageHeight,
    contentWidth: pageWidth - margin * 2,
  };

  pdfRenderHeader(ctx, filterSummary);
  pdfRenderSummaryBox(ctx, stats);
  pdfRenderIndex(ctx, sorted);

  for (let i = 0; i < sorted.length; i++) {
    pdfRenderGrantCard(ctx, sorted[i], i, i === sorted.length - 1);
  }

  pdfRenderFooter(ctx);

  return {
    filename: `iowa-grants-${todayStamp()}.pdf`,
    mimeType: "application/pdf",
    blob: doc.output("blob"),
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
  a.remove();
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
  const subject = `Grant Opportunities for Your Business — ${grantCount} grant${grantCount === 1 ? "" : "s"}`;
  let body = formattedText;
  if (body.length > MAILTO_MAX_BODY) {
    body = body.slice(0, MAILTO_MAX_BODY) + "\n\n…(truncated — see attached export for full list)";
  }
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
