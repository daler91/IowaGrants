"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import SearchBar from "@/components/SearchBar";
import GrantFilters from "@/components/GrantFilters";
import GrantList from "@/components/GrantList";
import ConfirmModal from "@/components/ConfirmModal";
import ActiveFilterChips, { computeActiveChips } from "@/components/ActiveFilterChips";
import Alert from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import Drawer from "@/components/ui/Drawer";
import { useAdmin } from "@/lib/hooks/useAdmin";
import type {
  GrantFilters as FilterType,
  GrantListItem,
  GrantSortDir,
  GrantSortKey,
  PaginatedResponse,
} from "@/lib/types";
import { buildGrantQueryParams } from "@/lib/query-params";
import { getDefaultFilters, DEFAULT_STATUS_FILTER } from "@/lib/filter-defaults";
import { toast } from "@/lib/toast";

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

function parseFiltersFromParams(params: URLSearchParams): { filters: FilterType; search: string } {
  const defaults = getDefaultFilters();
  return {
    search: params.get("search") || "",
    filters: {
      grantType: parseList<NonNullable<FilterType["grantType"]>[number]>(params.get("grantType")),
      gender: parseList<NonNullable<FilterType["gender"]>[number]>(params.get("gender")),
      businessStage: parseList<NonNullable<FilterType["businessStage"]>[number]>(
        params.get("businessStage"),
      ),
      status:
        parseList<NonNullable<FilterType["status"]>[number]>(params.get("status")) ||
        ([...DEFAULT_STATUS_FILTER] as NonNullable<FilterType["status"]>),
      eligibleExpense: parseList(params.get("eligibleExpense")),
      location: params.get("location") || undefined,
      industry: params.get("industry") || undefined,
      amountMin: parseOptionalNumber(params.get("amountMin")),
      amountMax: parseOptionalNumber(params.get("amountMax")),
      sort: parseSortKey(params.get("sort")),
      dir: parseSortDir(params.get("dir")),
      page: Number.parseInt(params.get("page") || "1") || 1,
      limit: defaults.limit,
    },
  };
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <div className="mb-8">
        <div className="h-9 w-72 bg-[var(--surface-hover)] rounded animate-pulse mb-2" />
        <div className="h-5 w-96 bg-[var(--surface-hover)] rounded animate-pulse" />
      </div>
      <div className="mb-6">
        <div className="h-12 bg-[var(--surface-hover)] rounded-lg animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-5 animate-pulse h-48"
          />
        ))}
      </div>
    </div>
  );
}

function Dashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated } = useAdmin();
  const initial = parseFiltersFromParams(searchParams);
  const [filters, setFilters] = useState<FilterType>(initial.filters);
  const [search, setSearch] = useState(initial.search);
  const [grants, setGrants] = useState<GrantListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  // Selection & delete state
  const [selectable, setSelectable] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{
    ids: string[];
    label: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the filter snapshot that the currently-rendered grants correspond
  // to. While the user is still in the 300ms debounce window, the current
  // filters differ from this ref — we use that gap to dim the result grid
  // so the click feels acknowledged before the skeleton appears.
  const lastFetchedKey = useRef("");

  const fetchGrants = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = buildGrantQueryParams(filters, search);
    params.set("page", (filters.page || 1).toString());
    params.set("limit", (filters.limit || 20).toString());
    const fetchKey = params.toString();

    try {
      const res = await fetch(`/api/grants?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load grants");
      const data: PaginatedResponse<GrantListItem> = await res.json();
      lastFetchedKey.current = fetchKey;
      setGrants(data.data);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (error) {
      console.error("Failed to fetch grants:", error);
      setError("Failed to load grants. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [search, filters]);

  // Sync filters to URL search params
  useEffect(() => {
    const params = buildGrantQueryParams(filters, search);
    if (filters.page && filters.page > 1) params.set("page", filters.page.toString());
    const paramStr = params.toString();
    const newUrl = paramStr ? `?${paramStr}` : "/";
    router.replace(newUrl, { scroll: false });
  }, [search, filters, router]);

  useEffect(() => {
    const debounce = setTimeout(fetchGrants, 300);
    return () => clearTimeout(debounce);
  }, [fetchGrants]);

  // Selection intentionally persists across pagination — admins often pick
  // grants from multiple pages before clicking Delete. The "Clear selection"
  // button in GrantList lets them reset explicitly.

  const handleClearSelection = () => setSelectedIds(new Set());

  const handleToggleSelectable = () => {
    setSelectable((prev: boolean) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    setDeleteTarget({
      ids: Array.from(selectedIds),
      label: `${selectedIds.size} grant${selectedIds.size > 1 ? "s" : ""}`,
    });
  };

  const handleDeleteSingle = (id: string, title: string) => {
    setDeleteTarget({ ids: [id], label: `"${title}"` });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/grants", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: deleteTarget.ids }),
      });
      if (!res.ok) throw new Error("Delete failed");

      const deletedCount = deleteTarget.ids.length;
      toast.success(deletedCount === 1 ? "Grant deleted" : `${deletedCount} grants deleted`);
      setSelectedIds((prev: Set<string>) => {
        const next = new Set(prev);
        deleteTarget.ids.forEach((id: string) => next.delete(id));
        return next;
      });
      setDeleteTarget(null);

      // Refresh and handle page overflow. Critical: the overflow probe must
      // use the same filter set as the dashboard fetch, otherwise totalPages
      // reflects the whole DB (not the filtered set) and can strand the user
      // on a page that is empty under their current filters.
      const probeParams = buildGrantQueryParams(filters, search);
      probeParams.set("page", "1");
      probeParams.set("limit", (filters.limit || 20).toString());
      const countRes = await fetch(`/api/grants?${probeParams.toString()}`);
      const countData: PaginatedResponse<GrantListItem> = await countRes.json();
      const currentPage = filters.page || 1;
      if (countData.totalPages === 0) {
        setFilters((f: FilterType) => ({ ...f, page: 1 }));
      } else if (currentPage > countData.totalPages) {
        setFilters((f: FilterType) => ({ ...f, page: countData.totalPages }));
      } else {
        fetchGrants();
      }
    } catch (error) {
      console.error("Failed to delete grants:", error);
      setError("Failed to delete grants. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const exportHref = useMemo(() => {
    const qs = buildGrantQueryParams(filters, search).toString();
    return qs ? `/export?${qs}` : "/export";
  }, [search, filters]);

  const handleClearAll = useCallback(() => {
    setSearch("");
    setFilters(getDefaultFilters());
  }, []);

  const handleSortChange = useCallback((sort: GrantSortKey, dir: GrantSortDir) => {
    setFilters((f: FilterType) => ({ ...f, sort, dir, page: 1 }));
  }, []);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const activeFilterCount = useMemo(
    () => computeActiveChips(filters, search).length,
    [filters, search],
  );
  const filtersCountSuffix = activeFilterCount > 0 ? ` (${activeFilterCount})` : "";

  // "pending" is true while the user has changed filters/search but the
  // next fetch hasn't committed yet (covers the 300ms debounce gap). It
  // is derived — no setState in effect — so the rule engine is happy.
  const currentKey = useMemo(() => {
    const params = buildGrantQueryParams(filters, search);
    params.set("page", (filters.page || 1).toString());
    params.set("limit", (filters.limit || 20).toString());
    return params.toString();
  }, [filters, search]);
  const pending = !loading && currentKey !== lastFetchedKey.current;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-h1 mb-2">Iowa Small Business Grants</h1>
        <p className="text-subtitle">
          Discover grants for small businesses and entrepreneurs in Iowa. Updated daily from
          federal, state, and local sources.
        </p>
      </div>

      <div className="mb-6">
        <SearchBar
          value={search}
          onChange={setSearch}
          hint="Searching titles and descriptions. Use filters for source, location, type, or amount."
        />
      </div>

      {error && (
        <div className="mb-4">
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      <ActiveFilterChips
        filters={filters}
        search={search}
        onFiltersChange={setFilters}
        onSearchChange={setSearch}
        onClearAll={handleClearAll}
      />

      {/* Mobile "Filters (N)" button — opens the filter drawer.
          Hidden on lg+ where the sidebar is always visible. */}
      <div className="lg:hidden mb-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setMobileFiltersOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={mobileFiltersOpen}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707L14 14v7l-4-2v-5L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <GrantFilters
            filters={filters}
            onChange={setFilters}
            onClear={handleClearAll}
            activeCount={activeFilterCount}
          />
        </aside>

        <div className="flex-1">
          <GrantList
            grants={grants}
            total={total}
            page={filters.page || 1}
            totalPages={totalPages}
            onPageChange={(page: number) => setFilters((f: FilterType) => ({ ...f, page }))}
            loading={loading}
            pending={pending}
            sort={filters.sort}
            dir={filters.dir}
            onSortChange={handleSortChange}
            exportHref={exportHref}
            hasActiveFilters={activeFilterCount > 0}
            onClearFilters={handleClearAll}
            selectable={isAuthenticated ? selectable : false}
            selectedIds={isAuthenticated ? selectedIds : undefined}
            onSelectionChange={isAuthenticated ? setSelectedIds : undefined}
            onDeleteSelected={isAuthenticated ? handleDeleteSelected : undefined}
            onDeleteSingle={isAuthenticated ? handleDeleteSingle : undefined}
            onToggleSelectable={isAuthenticated ? handleToggleSelectable : undefined}
            onClearSelection={isAuthenticated ? handleClearSelection : undefined}
          />
        </div>
      </div>

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete Grants"
        message={`Are you sure you want to delete ${deleteTarget?.label}? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />

      <Drawer
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        side="left"
        ariaLabel="Filters"
        title={`Filters${filtersCountSuffix}`}
      >
        <GrantFilters
          filters={filters}
          onChange={setFilters}
          onClear={handleClearAll}
          activeCount={activeFilterCount}
        />
        <div className="mt-4">
          <Button
            variant="primary"
            size="md"
            className="w-full"
            onClick={() => setMobileFiltersOpen(false)}
          >
            Apply
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
