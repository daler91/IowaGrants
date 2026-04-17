"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SearchBar from "@/components/SearchBar";
import GrantFilters from "@/components/GrantFilters";
import Alert from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { buildGrantQueryParams } from "@/lib/query-params";
import type { GrantFilters as FilterType, GrantSortDir, GrantSortKey } from "@/lib/types";
import {
  buildFilterSummary,
  buildMailto,
  toCSV,
  toJSON,
  toPDF,
  toText,
  triggerDownload,
  type ExportFormat,
  type GrantExportRow,
} from "@/lib/export-formatters";

const FORMATS: { value: ExportFormat; label: string; description: string }[] = [
  { value: "pdf", label: "PDF", description: "Nicely formatted document" },
  { value: "csv", label: "CSV", description: "Spreadsheet-friendly" },
  { value: "json", label: "JSON", description: "Machine-readable" },
  { value: "text", label: "Formatted Text", description: "Paste into an email" },
];

function parseList<T extends string = string>(raw: string | null): T[] | undefined {
  if (!raw) return undefined;
  const values = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as T[];
  return values.length ? values : undefined;
}

const VALID_SORT_KEYS: readonly GrantSortKey[] = [
  "deadline",
  "rollingFirst",
  "amount",
  "recent",
  "title",
];

function parseSortKey(raw: string | null): GrantSortKey | undefined {
  if (!raw) return undefined;
  return (VALID_SORT_KEYS as readonly string[]).includes(raw) ? (raw as GrantSortKey) : undefined;
}

function parseSortDir(raw: string | null): GrantSortDir | undefined {
  return raw === "asc" || raw === "desc" ? raw : undefined;
}

function parseOptionalNumber(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? undefined : n;
}

function parseFiltersFromParams(params: URLSearchParams): {
  filters: FilterType;
  search: string;
  format: ExportFormat;
} {
  const format = (params.get("format") as ExportFormat) || "pdf";
  return {
    search: params.get("search") || "",
    format: FORMATS.some((f) => f.value === format) ? format : "pdf",
    filters: {
      grantType: parseList<NonNullable<FilterType["grantType"]>[number]>(params.get("grantType")),
      gender: parseList<NonNullable<FilterType["gender"]>[number]>(params.get("gender")),
      businessStage: parseList<NonNullable<FilterType["businessStage"]>[number]>(
        params.get("businessStage"),
      ),
      status: parseList<NonNullable<FilterType["status"]>[number]>(params.get("status")),
      eligibleExpense: parseList(params.get("eligibleExpense")),
      location: params.get("location") || undefined,
      industry: params.get("industry") || undefined,
      amountMin: parseOptionalNumber(params.get("amountMin")),
      amountMax: parseOptionalNumber(params.get("amountMax")),
      sort: parseSortKey(params.get("sort")),
      dir: parseSortDir(params.get("dir")),
    },
  };
}

/**
 * Serialize the current export-page state. Delegates to the canonical
 * `buildGrantQueryParams` so any new filter dimension added to the
 * dashboard is automatically supported here too — the export page used
 * to ship its own duplicate serializer that silently dropped industry,
 * amount, and sort.
 */
function buildQueryString(filters: FilterType, search: string, format?: ExportFormat): string {
  const params = buildGrantQueryParams(filters, search);
  if (format) params.set("format", format);
  return params.toString();
}

export default function ExportPage() {
  return (
    <Suspense fallback={<div className="h-10 w-48 bg-gray-200 rounded animate-pulse" />}>
      <ExportPageInner />
    </Suspense>
  );
}

function ExportPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initial = parseFiltersFromParams(searchParams);

  const [filters, setFilters] = useState<FilterType>(initial.filters);
  const [search, setSearch] = useState(initial.search);
  const [format, setFormat] = useState<ExportFormat>(initial.format);

  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For formatted-text preview / mailto / copy-to-clipboard
  const [textOutput, setTextOutput] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");

  const filterSummary = useMemo(() => buildFilterSummary(filters, search), [filters, search]);

  // Sync state → URL (shareable link)
  useEffect(() => {
    const qs = buildQueryString(filters, search, format);
    const newUrl = qs ? `/export?${qs}` : "/export";
    router.replace(newUrl, { scroll: false });
  }, [filters, search, format, router]);

  // Clear text preview whenever filters/format change
  useEffect(() => {
    setTextOutput(null);
  }, [filters, search, format]);

  // Preview count from list endpoint (cheap call, limit=1)
  const fetchPreviewCount = useCallback(async () => {
    setCountLoading(true);
    setError(null);
    try {
      const qs = buildQueryString(filters, search);
      const res = await fetch(`/api/grants?${qs}&limit=1&page=1`);
      if (!res.ok) throw new Error("Failed to load count");
      const data = (await res.json()) as { total: number };
      setPreviewCount(data.total);
    } catch (e) {
      console.error(e);
      setError("Failed to load matching grants count.");
    } finally {
      setCountLoading(false);
    }
  }, [filters, search]);

  useEffect(() => {
    const t = setTimeout(fetchPreviewCount, 300);
    return () => clearTimeout(t);
  }, [fetchPreviewCount]);

  const fetchExportData = useCallback(async (): Promise<{
    grants: GrantExportRow[];
    truncated: boolean;
  }> => {
    const qs = buildQueryString(filters, search);
    const res = await fetch(`/api/grants/export?${qs}`);
    if (!res.ok) throw new Error("Failed to load grants for export");
    const data = (await res.json()) as {
      data: GrantExportRow[];
      total: number;
      truncated: boolean;
    };
    return { grants: data.data, truncated: data.truncated };
  }, [filters, search]);

  const handleDownload = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { grants, truncated: wasTruncated } = await fetchExportData();
      setTruncated(wasTruncated);

      if (grants.length === 0) {
        setError("No grants match your filters.");
        return;
      }

      if (format === "json") {
        triggerDownload(toJSON(grants));
      } else if (format === "csv") {
        triggerDownload(toCSV(grants));
      } else if (format === "pdf") {
        triggerDownload(toPDF(grants, filterSummary));
      } else {
        const result = toText(grants, filterSummary);
        setTextOutput(result.text);
        triggerDownload(result);
      }
    } catch (e) {
      console.error(e);
      setError("Failed to generate export. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyText = async () => {
    if (!textOutput) return;
    try {
      await navigator.clipboard.writeText(textOutput);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleOpenInEmail = () => {
    if (!textOutput) return;
    globalThis.location.href = buildMailto(textOutput, previewCount ?? 0);
  };

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(globalThis.location.href);
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
      toast.success("Share link copied");
    } catch {
      toast.error("Failed to copy share link");
    }
  };

  const generatingLabel = (() => {
    if (!generating) return null;
    if (format === "pdf") return "Generating PDF…";
    if (format === "csv") return "Building CSV…";
    if (format === "json") return "Building JSON…";
    return "Building text…";
  })();

  let previewSummary: JSX.Element | null = null;
  if (countLoading) {
    previewSummary = <span className="text-[var(--muted)]">Counting matching grants…</span>;
  } else if (previewCount !== null) {
    const pluralSuffix = previewCount === 1 ? "" : "s";
    previewSummary = (
      <span className="text-[var(--foreground)]">
        <strong>{previewCount}</strong> grant{pluralSuffix} match your filters
        {previewCount > 1000 && (
          <span className="text-amber-700"> — only the first 1000 will be exported</span>
        )}
      </span>
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Export Grants</h1>
          <p className="text-[var(--muted)]">
            Export filtered grants as PDF, CSV, JSON, or formatted text you can paste into an email.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCopyShareLink}
          title="Copy a link with these filters + format"
        >
          {shareStatus === "copied" ? "Link copied!" : "Copy share link"}
        </Button>
      </div>

      <div className="mb-6">
        <SearchBar value={search} onChange={setSearch} />
      </div>

      {error && (
        <div className="mb-4">
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="w-full lg:w-64 flex-shrink-0">
          <GrantFilters filters={filters} onChange={setFilters} />
        </aside>

        <div className="flex-1 space-y-6">
          {/* Format selector */}
          <fieldset className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-5">
            <legend className="font-semibold text-[var(--foreground)] mb-3 px-1">
              Export format
            </legend>
            <div
              role="radiogroup"
              aria-label="Export format"
              className="grid grid-cols-2 md:grid-cols-4 gap-3"
            >
              {FORMATS.map((f) => {
                const active = format === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setFormat(f.value)}
                    className={`text-left p-3 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                      active
                        ? "border-[var(--primary)] bg-[var(--info-bg)] ring-2 ring-[var(--primary-light)]"
                        : "border-[var(--border)] hover:border-[var(--muted)]"
                    }`}
                  >
                    <span className="block font-medium text-[var(--foreground)]">{f.label}</span>
                    <span className="block text-xs text-[var(--muted)] mt-0.5">
                      {f.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Summary + download */}
          <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-5">
            <div className="mb-3">
              <div className="text-sm text-[var(--muted)] mb-1">Filters</div>
              <div className="text-sm text-[var(--foreground)]">{filterSummary}</div>
            </div>
            <div className="mb-4 text-sm">{previewSummary}</div>

            {truncated && (
              <div className="mb-4">
                <Alert variant="warning">
                  Showing first 1000 results — narrow your filters to export more.
                </Alert>
              </div>
            )}

            <Button onClick={handleDownload} disabled={generating || previewCount === 0}>
              {generatingLabel ?? `Download ${format.toUpperCase()}`}
            </Button>
          </div>

          {/* Formatted text preview + mailto */}
          {format === "text" && textOutput && (
            <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-[var(--foreground)]">Email-ready text</h2>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={handleCopyText}>
                    {copyStatus === "copied" ? "Copied!" : "Copy to clipboard"}
                  </Button>
                  <Button size="sm" onClick={handleOpenInEmail}>
                    Open in email
                  </Button>
                </div>
              </div>
              <textarea
                readOnly
                value={textOutput}
                className="w-full h-80 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] font-mono text-xs text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
