"use client";

import { useState, useEffect, useCallback } from "react";
import SearchBar from "@/components/SearchBar";
import GrantFilters from "@/components/GrantFilters";
import GrantList from "@/components/GrantList";
import ConfirmModal from "@/components/ConfirmModal";
import type { GrantFilters as FilterType } from "@/lib/types";

interface Grant {
  id: string;
  title: string;
  description: string;
  sourceName: string;
  grantType: string;
  status: string;
  gender: string;
  businessStage: string;
  amount?: string | null;
  deadline?: string | null;
  locations: string[];
  eligibleExpenses: { name: string; label: string }[];
}

interface ApiResponse {
  data: Grant[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function Dashboard() {
  const [filters, setFilters] = useState<FilterType>({ page: 1, limit: 20 });
  const [search, setSearch] = useState("");
  const [grants, setGrants] = useState<Grant[]>([]);
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

  const fetchGrants = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();

    if (search) params.set("search", search);
    if (filters.grantType) params.set("grantType", filters.grantType);
    if (filters.gender) params.set("gender", filters.gender);
    if (filters.businessStage) params.set("businessStage", filters.businessStage);
    if (filters.status) params.set("status", filters.status);
    if (filters.eligibleExpense) params.set("eligibleExpense", filters.eligibleExpense);
    if (filters.location) params.set("location", filters.location);
    if (filters.amountMin) params.set("amountMin", filters.amountMin.toString());
    if (filters.amountMax) params.set("amountMax", filters.amountMax.toString());
    params.set("page", (filters.page || 1).toString());
    params.set("limit", (filters.limit || 20).toString());

    try {
      const res = await fetch(`/api/grants?${params.toString()}`);
      const data: ApiResponse = await res.json();
      setGrants(data.data);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (error) {
      console.error("Failed to fetch grants:", error);
    } finally {
      setLoading(false);
    }
  }, [search, filters]);

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
      ids: [...selectedIds],
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
      const countData: ApiResponse = await countRes.json();
      const currentPage = filters.page || 1;
      if (currentPage > countData.totalPages && countData.totalPages > 0) {
        setFilters((f: FilterType) => ({ ...f, page: countData.totalPages }));
      } else {
        fetchGrants();
      }
    } catch (error) {
      console.error("Failed to delete grants:", error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">
          Iowa Small Business Grants
        </h1>
        <p className="text-[var(--muted)]">
          Discover grants for small businesses and entrepreneurs in Iowa.
          Updated daily from federal, state, and local sources.
        </p>
      </div>

      <div className="mb-6">
        <SearchBar value={search} onChange={setSearch} />
      </div>

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
            selectable={selectable}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onDeleteSelected={handleDeleteSelected}
            onDeleteSingle={handleDeleteSingle}
            onToggleSelectable={handleToggleSelectable}
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
