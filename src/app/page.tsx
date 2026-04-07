"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import GrantFilters from "@/components/GrantFilters";
import GrantList from "@/components/GrantList";
import ConfirmModal from "@/components/ConfirmModal";
import { useAdmin } from "@/lib/hooks/useAdmin";
import type { GrantFilters as FilterType, GrantListItem, PaginatedResponse } from "@/lib/types";
import { buildGrantQueryParams } from "@/lib/query-params";

function parseList<T extends string = string>(raw: string | null): T[] | undefined {
  if (!raw) return undefined;
  const values = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as T[];
  return values.length ? values : undefined;
}

function parseFiltersFromParams(params: URLSearchParams): { filters: FilterType; search: string } {
  return {
    search: params.get("search") || "",
    filters: {
      grantType: parseList<NonNullable<FilterType["grantType"]>[number]>(params.get("grantType")),
      gender: parseList<NonNullable<FilterType["gender"]>[number]>(params.get("gender")),
      businessStage: parseList<NonNullable<FilterType["businessStage"]>[number]>(
        params.get("businessStage"),
      ),
      status: parseList<NonNullable<FilterType["status"]>[number]>(params.get("status")) || (["OPEN", "FORECASTED"] as NonNullable<FilterType["status"]>),
      eligibleExpense: parseList(params.get("eligibleExpense")),
      location: params.get("location") || undefined,
      page: Number.parseInt(params.get("page") || "1") || 1,
      limit: 20,
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
        <div className="h-9 w-72 bg-gray-200 rounded animate-pulse mb-2" />
        <div className="h-5 w-96 bg-gray-200 rounded animate-pulse" />
      </div>
      <div className="mb-6">
        <div className="h-12 bg-gray-200 rounded-lg animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="bg-white rounded-lg border border-[var(--border)] p-5 animate-pulse h-48"
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

  const fetchGrants = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = buildGrantQueryParams(filters, search);
    params.set("page", (filters.page || 1).toString());
    params.set("limit", (filters.limit || 20).toString());

    try {
      const res = await fetch(`/api/grants?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load grants");
      const data: PaginatedResponse<GrantListItem> = await res.json();
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

  // Clear selection when page changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filters.page]);

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

      setSelectedIds((prev: Set<string>) => {
        const next = new Set(prev);
        deleteTarget.ids.forEach((id: string) => next.delete(id));
        return next;
      });
      setDeleteTarget(null);

      // Refresh and handle page overflow
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", (filters.limit || 20).toString());
      const countRes = await fetch(`/api/grants?${params.toString()}`);
      const countData: PaginatedResponse<GrantListItem> = await countRes.json();
      const currentPage = filters.page || 1;
      if (currentPage > countData.totalPages && countData.totalPages > 0) {
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

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">
            Iowa Small Business Grants
          </h1>
          <p className="text-[var(--muted)]">
            Discover grants for small businesses and entrepreneurs in Iowa. Updated daily from
            federal, state, and local sources.
          </p>
        </div>
        <Link
          href={exportHref}
          className="self-start inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] bg-white hover:bg-gray-50 text-[var(--foreground)] font-medium transition-colors"
          title="Export these filtered grants"
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
              d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
            />
          </svg>
          Export
        </Link>
      </div>

      <div className="mb-6">
        <SearchBar value={search} onChange={setSearch} />
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="w-full lg:w-64 flex-shrink-0">
          <GrantFilters filters={filters} onChange={setFilters} />
        </aside>

        <div className="flex-1">
          <GrantList
            grants={grants}
            total={total}
            page={filters.page || 1}
            totalPages={totalPages}
            onPageChange={(page: number) => setFilters((f: FilterType) => ({ ...f, page }))}
            loading={loading}
            selectable={isAuthenticated ? selectable : false}
            selectedIds={isAuthenticated ? selectedIds : undefined}
            onSelectionChange={isAuthenticated ? setSelectedIds : undefined}
            onDeleteSelected={isAuthenticated ? handleDeleteSelected : undefined}
            onDeleteSingle={isAuthenticated ? handleDeleteSingle : undefined}
            onToggleSelectable={isAuthenticated ? handleToggleSelectable : undefined}
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
    </div>
  );
}
