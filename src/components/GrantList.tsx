"use client";

import GrantCard from "./GrantCard";

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

interface GrantListProps {
  grants: Grant[];
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  loading: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onDeleteSelected?: () => void;
  onDeleteSingle?: (id: string, title: string) => void;
  onToggleSelectable?: () => void;
}

export default function GrantList({
  grants,
  total,
  page,
  totalPages,
  onPageChange,
  loading,
  selectable = false,
  selectedIds = new Set(),
  onSelectionChange,
  onDeleteSelected,
  onDeleteSingle,
  onToggleSelectable,
}: Readonly<GrantListProps>) {
  const allOnPageSelected =
    grants.length > 0 && grants.every((g) => selectedIds.has(g.id));

  const handleSelectAll = () => {
    if (!onSelectionChange) return;
    if (allOnPageSelected) {
      const next = new Set(selectedIds);
      grants.forEach((g) => next.delete(g.id));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      grants.forEach((g) => next.add(g.id));
      onSelectionChange(next);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectionChange(next);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 6 }, (_, i) => `skeleton-${i}`).map((key) => (
          <div
            key={key}
            className="bg-white rounded-lg border border-[var(--border)] p-5 animate-pulse"
          >
            <div className="flex gap-2 mb-3">
              <div className="h-5 w-16 bg-gray-200 rounded-full" />
              <div className="h-5 w-12 bg-gray-200 rounded-full" />
            </div>
            <div className="h-5 bg-gray-200 rounded mb-2 w-3/4" />
            <div className="h-4 bg-gray-200 rounded mb-1 w-full" />
            <div className="h-4 bg-gray-200 rounded mb-1 w-5/6" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (grants.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-lg border border-[var(--border)]">
        <svg
          className="mx-auto h-12 w-12 text-[var(--muted)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-[var(--foreground)]">
          No grants found
        </h3>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Try adjusting your search or filters.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <p className="text-sm text-[var(--muted)]">
            Showing {grants.length} of {total} grants
          </p>
          {selectable && selectedIds.size > 0 && (
            <span className="text-sm font-medium text-blue-600">
              {selectedIds.size} selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectable && (
            <>
              <label className="flex items-center gap-1.5 text-sm text-[var(--muted)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />{" "}
                <span>Select all</span>
              </label>
              <button
                onClick={onDeleteSelected}
                disabled={selectedIds.size === 0}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete ({selectedIds.size})
              </button>
            </>
          )}
          <button
            onClick={onToggleSelectable}
            className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
              selectable
                ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                : "border-[var(--border)] text-[var(--muted)] hover:bg-gray-50"
            }`}
          >
            {selectable ? "Cancel" : "Select"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {grants.map((grant) => (
          <GrantCard
            key={grant.id}
            grant={grant}
            selectable={selectable}
            selected={selectedIds.has(grant.id)}
            onSelectChange={handleSelectOne}
            onDelete={onDeleteSingle}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-8">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-[var(--muted)] px-4">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
