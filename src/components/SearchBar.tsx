"use client";

import type { ReactNode } from "react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: ReactNode;
}

export default function SearchBar({
  value,
  onChange,
  placeholder = "Search titles and descriptions…",
  hint,
}: Readonly<SearchBarProps>) {
  return (
    <div>
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Search grants"
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-transparent text-[var(--foreground)] placeholder:text-[var(--muted)]"
        />
      </div>
      {hint && <p className="text-xs text-[var(--muted)] mt-1">{hint}</p>}
    </div>
  );
}
