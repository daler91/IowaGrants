"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { GrantFilters as FilterType } from "@/lib/types";

interface GrantFiltersProps {
  filters: FilterType;
  onChange: (filters: FilterType) => void;
}

type Option = { value: string; label: string };

const GRANT_TYPES: Option[] = [
  { value: "FEDERAL", label: "Federal" },
  { value: "STATE", label: "State" },
  { value: "LOCAL", label: "Local" },
  { value: "PRIVATE", label: "Private" },
];

const GENDER_OPTIONS: Option[] = [
  { value: "WOMEN", label: "Women-Owned" },
  { value: "VETERAN", label: "Veteran-Owned" },
  { value: "MINORITY", label: "Minority-Owned" },
  { value: "GENERAL", label: "General" },
];

const BUSINESS_STAGES: Option[] = [
  { value: "STARTUP", label: "Starting a Business" },
  { value: "EXISTING", label: "Existing Business" },
  { value: "BOTH", label: "Both" },
];

const STATUS_OPTIONS: Option[] = [
  { value: "OPEN", label: "Open" },
  { value: "CLOSED", label: "Closed" },
  { value: "FORECASTED", label: "Forecasted" },
];

const EXPENSE_OPTIONS: Option[] = [
  { value: "EQUIPMENT", label: "Equipment Purchases" },
  { value: "FACADE_IMPROVEMENT", label: "Facade / Real Estate" },
  { value: "JOB_CREATION", label: "Job Creation / Hiring" },
  { value: "TECHNOLOGY", label: "Technology & Software" },
  { value: "WORKING_CAPITAL", label: "Working Capital" },
  { value: "RESEARCH_DEVELOPMENT", label: "R&D" },
  { value: "MARKETING_EXPORT", label: "Marketing & Export" },
];

function MultiSelect({
  label,
  options,
  values,
  placeholder,
  onChange,
}: Readonly<{
  label: string;
  options: Option[];
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const toggleValue = (value: string) => {
    if (values.includes(value)) {
      onChange(values.filter((v) => v !== value));
    } else {
      onChange([...values, value]);
    }
  };

  const summary = (() => {
    if (values.length === 0) return placeholder;
    if (values.length === 1) {
      return options.find((o) => o.value === values[0])?.label ?? values[0];
    }
    if (values.length <= 2) {
      return values.map((v) => options.find((o) => o.value === v)?.label ?? v).join(", ");
    }
    return `${values.length} selected`;
  })();

  return (
    <div ref={containerRef} className="relative">
      <div className="block text-sm font-medium text-[var(--muted)] mb-1">{label}</div>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-white text-left text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-light)]"
      >
        <span className={`truncate ${values.length === 0 ? "text-[var(--muted)]" : ""}`}>
          {summary}
        </span>
        <svg
          className={`w-4 h-4 flex-shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-white shadow-lg py-1"
        >
          {options.map((opt) => {
            const checked = values.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleValue(opt.value)}
                  className="w-4 h-4 rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary-light)]"
                />
                <span className="truncate">{opt.label}</span>
              </label>
            );
          })}
          {values.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-2 text-xs text-[var(--primary)] hover:bg-gray-50 border-t border-[var(--border)]"
            >
              Clear {label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function GrantFilters({ filters, onChange }: Readonly<GrantFiltersProps>) {
  const update = <K extends keyof FilterType>(key: K, values: string[]) => {
    onChange({
      ...filters,
      [key]: (values.length ? values : undefined) as FilterType[K],
      page: 1,
    });
  };

  return (
    <div className="bg-white rounded-lg border border-[var(--border)] p-4">
      <h3 className="font-semibold text-[var(--foreground)] mb-4">Filters</h3>
      <div className="space-y-4">
        <MultiSelect
          label="Business Stage"
          options={BUSINESS_STAGES}
          values={filters.businessStage ?? []}
          placeholder="All Stages"
          onChange={(v) => update("businessStage", v)}
        />
        <MultiSelect
          label="Grant Type"
          options={GRANT_TYPES}
          values={filters.grantType ?? []}
          placeholder="All Types"
          onChange={(v) => update("grantType", v)}
        />
        <MultiSelect
          label="Demographics"
          options={GENDER_OPTIONS}
          values={filters.gender ?? []}
          placeholder="All"
          onChange={(v) => update("gender", v)}
        />
        <MultiSelect
          label="Use of Funds"
          options={EXPENSE_OPTIONS}
          values={filters.eligibleExpense ?? []}
          placeholder="All Uses"
          onChange={(v) => update("eligibleExpense", v)}
        />
        <MultiSelect
          label="Status"
          options={STATUS_OPTIONS}
          values={filters.status ?? []}
          placeholder="All"
          onChange={(v) => update("status", v)}
        />
        <button
          onClick={() => onChange({ page: 1 })}
          className="w-full py-2 text-sm text-[var(--primary)] hover:text-[var(--primary-light)] font-medium transition-colors"
        >
          Clear All Filters
        </button>
      </div>
    </div>
  );
}
