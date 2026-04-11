"use client";

import GrantCard from "./GrantCard";
import { Button } from "@/components/ui/Button";
import type { GrantListItem, GrantSortKey, GrantSortDir } from "@/lib/types";

interface GrantListProps {
  grants: GrantListItem[];
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  loading: boolean;
  sort?: GrantSortKey;
  dir?: GrantSortDir;
  onSortChange?: (sort: GrantSortKey, dir: GrantSortDir) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onDeleteSelected?: () => void;
  onDeleteSingle?: (id: string, title: string) => void;
  onToggleSelectable?: () => void;
  onClearSelection?: () => void;
}

/**
 * Sort dropdown value → (key, dir) pairs. Encoded as single strings so
 * a native <select> can expose the full set without nesting a second
 * direction toggle. Order matches the visual dropdown.
 */
const SORT_OPTIONS: { value: string; label: string; sort: GrantSortKey; dir: GrantSortDir }[] = [
  { value: "deadline-asc", label: "Deadline (soonest)", sort: "deadline", dir: "asc" },
  { value: "rollingFirst-asc", label: "Rolling first", sort: "rollingFirst", dir: "asc" },
  { value: "amount-desc", label: "Amount (highest)", sort: "amount", dir: "desc" },
  { value: "recent-desc", label: "Newest added", sort: "recent", dir: "desc" },
  { value: "title-asc", label: "Title (A–Z)", sort: "title", dir: "asc" },
];

function encodeSortValue(sort: GrantSortKey | undefined, dir: GrantSortDir | undefined): string {
  return `${sort ?? "deadline"}-${dir ?? "asc"}`;
}

export default function GrantList({
  grants,
  total,
  page,
  totalPages,
  onPageChange,
  loading,
  sort,
  dir,
  onSortChange,
  selectable = false,
  selectedIds = new Set(),
  onSelectionChange,
  onDeleteSelected,
  onDeleteSingle,
  onToggleSelectable,
  onClearSelection,
}: Readonly<GrantListProps>) {
  const allOnPageSelected = grants.length > 0 && grants.every((g) => selectedIds.has(g.id));

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
            className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-5 animate-pulse"
          >
            <div className="flex gap-2 mb-3">
              <div className="h-5 w-16 bg-[var(--surface-hover)] rounded-full" />
              <div className="h-5 w-12 bg-[var(--surface-hover)] rounded-full" />
            </div>
            <div className="h-5 bg-[var(--surface-hover)] rounded mb-2 w-3/4" />
            <div className="h-4 bg-[var(--surface-hover)] rounded mb-1 w-full" />
            <div className="h-4 bg-[var(--surface-hover)] rounded mb-1 w-5/6" />
            <div className="h-4 bg-[var(--surface-hover)] rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (grants.length === 0) {
    return (
      <div className="text-center py-16 bg-[var(--card)] rounded-lg border border-[var(--border)]">
        <svg
          className="mx-auto h-12 w-12 text-[var(--muted)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-[var(--foreground)]">No grants found</h3>
        <p className="mt-2 text-sm text-[var(--muted)]">Try adjusting your search or filters.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-[var(--muted)]">
            Showing {grants.length} of {total} grants
          </p>
          {onSortChange && (
            <label className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
              <span className="sr-only sm:not-sr-only">Sort by</span>
              <select
                value={encodeSortValue(sort, dir)}
                onChange={(e) => {
                  const match = SORT_OPTIONS.find((opt) => opt.value === e.target.value);
                  if (match) onSortChange(match.sort, match.dir);
                }}
                className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                aria-label="Sort grants"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selectable && selectedIds.size > 0 && (
            <>
              <span className="text-sm font-medium text-[var(--primary)]">
                {selectedIds.size} selected
              </span>
              {onClearSelection && (
                <Button variant="ghost" size="sm" onClick={onClearSelection}>
                  Clear selection
                </Button>
              )}
            </>
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
                  aria-label="Select all grants on this page"
                  className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)]"
                />{" "}
                <span>Select all</span>
              </label>
              <Button
                variant="danger"
                size="sm"
                onClick={onDeleteSelected}
                disabled={selectedIds.size === 0}
              >
                Delete ({selectedIds.size})
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={onToggleSelectable}
            aria-pressed={selectable || undefined}
          >
            {selectable ? "Cancel" : "Select"}
          </Button>
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <span className="text-sm text-[var(--muted)] px-4">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
