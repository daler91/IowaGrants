"use client";

import { useState, useEffect, useCallback } from "react";
import SearchBar from "@/components/SearchBar";
import GrantFilters from "@/components/GrantFilters";
import GrantList from "@/components/GrantList";
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
            onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}
