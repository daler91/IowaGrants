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
}

export default function GrantList({
  grants,
  total,
  page,
  totalPages,
  onPageChange,
  loading,
}: GrantListProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
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
      <p className="text-sm text-[var(--muted)] mb-4">
        Showing {grants.length} of {total} grants
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {grants.map((grant) => (
          <GrantCard key={grant.id} grant={grant} />
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
