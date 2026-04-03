"use client";

import type { GrantFilters as FilterType } from "@/lib/types";

interface GrantFiltersProps {
  filters: FilterType;
  onChange: (filters: FilterType) => void;
}

const GRANT_TYPES = [
  { value: "", label: "All Types" },
  { value: "FEDERAL", label: "Federal" },
  { value: "STATE", label: "State" },
  { value: "LOCAL", label: "Local" },
  { value: "PRIVATE", label: "Private" },
];

const GENDER_OPTIONS = [
  { value: "", label: "All" },
  { value: "WOMEN", label: "Women-Owned" },
  { value: "VETERAN", label: "Veteran-Owned" },
  { value: "MINORITY", label: "Minority-Owned" },
  { value: "GENERAL", label: "General" },
];

const BUSINESS_STAGES = [
  { value: "", label: "All Stages" },
  { value: "STARTUP", label: "Starting a Business" },
  { value: "EXISTING", label: "Existing Business" },
  { value: "BOTH", label: "Both" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "CLOSED", label: "Closed" },
  { value: "FORECASTED", label: "Forecasted" },
];

const EXPENSE_OPTIONS = [
  { value: "", label: "All Uses" },
  { value: "EQUIPMENT", label: "Equipment Purchases" },
  { value: "FACADE_IMPROVEMENT", label: "Facade / Real Estate" },
  { value: "JOB_CREATION", label: "Job Creation / Hiring" },
  { value: "TECHNOLOGY", label: "Technology & Software" },
  { value: "WORKING_CAPITAL", label: "Working Capital" },
  { value: "RESEARCH_DEVELOPMENT", label: "R&D" },
  { value: "MARKETING_EXPORT", label: "Marketing & Export" },
];

function FilterSelect({
  label,
  options,
  value,
  onChange,
}: Readonly<{
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}>) {
  const selectId = `filter-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <label htmlFor={selectId} className="block text-sm font-medium text-[var(--muted)] mb-1">
        {label}
      </label>
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-white text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-light)] text-sm"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function GrantFilters({ filters, onChange }: Readonly<GrantFiltersProps>) {
  const update = (key: string, value: string) => {
    onChange({ ...filters, [key]: value || undefined, page: 1 });
  };

  return (
    <div className="bg-white rounded-lg border border-[var(--border)] p-4">
      <h3 className="font-semibold text-[var(--foreground)] mb-4">Filters</h3>
      <div className="space-y-4">
        <FilterSelect
          label="Business Stage"
          options={BUSINESS_STAGES}
          value={filters.businessStage || ""}
          onChange={(v) => update("businessStage", v)}
        />
        <FilterSelect
          label="Grant Type"
          options={GRANT_TYPES}
          value={filters.grantType || ""}
          onChange={(v) => update("grantType", v)}
        />
        <FilterSelect
          label="Demographics"
          options={GENDER_OPTIONS}
          value={filters.gender || ""}
          onChange={(v) => update("gender", v)}
        />
        <FilterSelect
          label="Use of Funds"
          options={EXPENSE_OPTIONS}
          value={filters.eligibleExpense || ""}
          onChange={(v) => update("eligibleExpense", v)}
        />
        <FilterSelect
          label="Status"
          options={STATUS_OPTIONS}
          value={filters.status || ""}
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
