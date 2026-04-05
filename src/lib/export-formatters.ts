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
  const lines: string[] = [];
  const headerTitle = "IOWA GRANTS EXPORT";
  lines.push(headerTitle);
  lines.push("=".repeat(headerTitle.length));
  lines.push(
    `Date: ${new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`,
  );
  lines.push(`Filters: ${filterSummary}`);
  lines.push(`Grants: ${grants.length}`);
  lines.push("");

  grants.forEach((g, i) => {
    const title = `${i + 1}. ${g.title}`;
    lines.push(title);
    lines.push("-".repeat(Math.min(title.length, 72)));
    lines.push(`  Type:       ${g.grantType}`);
    lines.push(`  Status:     ${g.status}`);
    lines.push(`  Deadline:   ${formatDeadline(g.deadline)}`);
    if (g.amount) lines.push(`  Amount:     ${g.amount}`);
    lines.push(`  Stage:      ${prettyValue(g.businessStage)}`);
    if (g.gender && g.gender !== "ANY" && g.gender !== "GENERAL") {
      lines.push(`  Focus:      ${prettyValue(g.gender)}`);
    }
    if (g.locations.length) lines.push(`  Locations:  ${g.locations.join(", ")}`);
    if (g.eligibleExpenses.length) {
      lines.push(`  Uses:       ${g.eligibleExpenses.map((e) => e.label).join(", ")}`);
    }
    lines.push("");
    lines.push("  Description:");
    // Soft-wrap description at ~80 chars, indented.
    const wrapped = softWrap(g.description, 76);
    for (const wline of wrapped) lines.push(`    ${wline}`);
    lines.push("");
    lines.push(`  Source: ${g.sourceName}`);
    lines.push(`  Link:   ${g.sourceUrl}`);
    lines.push("");
  });

  const text = lines.join("\n");
  return {
    filename: `iowa-grants-${todayStamp()}.txt`,
    mimeType: "text/plain",
    blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
    text,
  };
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
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // ── Header ────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(30, 64, 175); // primary blue
  doc.text("Iowa Grants Export", margin, y);
  y += 24;

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
  y += filterLines.length * 12 + 2;
  doc.text(`${grants.length} grant${grants.length === 1 ? "" : "s"}`, margin, y);
  y += 18;

  // Divider
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
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

  for (let i = 0; i < grants.length; i++) {
    const g = grants[i];

    ensureSpace(90);

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42); // slate-900
    const titleLines = doc.splitTextToSize(`${i + 1}. ${g.title}`, contentWidth) as string[];
    doc.text(titleLines, margin, y);
    y += titleLines.length * 16;

    // Pills: type + status
    const typeColors = TYPE_PILL_COLORS[g.grantType] ?? DEFAULT_PILL;
    const statusColors = STATUS_PILL_COLORS[g.status] ?? DEFAULT_PILL;
    const pillY = y;
    const typeW = drawPill(g.grantType, margin, pillY, typeColors);
    drawPill(g.status, margin + typeW + 6, pillY, statusColors);
    y += 22;

    // Meta rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85); // slate-700

    const metaRow = (label: string, value: string) => {
      ensureSpace(14);
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, margin, y);
      doc.setFont("helvetica", "normal");
      const valueLines = doc.splitTextToSize(value, contentWidth - 80) as string[];
      doc.text(valueLines, margin + 70, y);
      y += valueLines.length * 13;
    };

    metaRow("Deadline", formatDeadline(g.deadline));
    if (g.amount) metaRow("Amount", g.amount);
    metaRow("Stage", prettyValue(g.businessStage));
    if (g.gender && g.gender !== "ANY" && g.gender !== "GENERAL") {
      metaRow("Focus", prettyValue(g.gender));
    }
    if (g.locations.length) metaRow("Locations", g.locations.join(", "));
    if (g.eligibleExpenses.length) {
      metaRow("Uses", g.eligibleExpenses.map((e) => e.label).join(", "));
    }

    // Description
    y += 4;
    ensureSpace(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Description", margin, y);
    y += 13;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105); // slate-600
    const descLines = doc.splitTextToSize(g.description, contentWidth) as string[];
    for (const line of descLines) {
      ensureSpace(12);
      doc.text(line, margin, y);
      y += 12;
    }

    // Source (clickable)
    y += 4;
    ensureSpace(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(51, 65, 85);
    doc.text("Source:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 64, 175); // link blue
    const sourceLabel = `${g.sourceName}`;
    doc.text(sourceLabel, margin + 46, y);
    y += 12;
    ensureSpace(14);
    const urlLines = doc.splitTextToSize(g.sourceUrl, contentWidth) as string[];
    for (const line of urlLines) {
      ensureSpace(12);
      doc.textWithLink(line, margin, y, { url: g.sourceUrl });
      y += 12;
    }

    // Separator between grants
    y += 8;
    if (i < grants.length - 1) {
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
    doc.text(`Iowa Grants Export — Page ${p} of ${pageCount}`, pageWidth / 2, pageHeight - 20, {
      align: "center",
    });
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
