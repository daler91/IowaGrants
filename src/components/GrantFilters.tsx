"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { GrantFilters as FilterType } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import Combobox from "@/components/ui/Combobox";
import { useMetaValues } from "@/lib/hooks/useMetaValues";

interface GrantFiltersProps {
  filters: FilterType;
  onChange: (filters: FilterType) => void;
  /**
   * Called when the user clicks "Clear All Filters". The parent decides what
   * "clear" means (typically: restore defaults via getDefaultFilters()).
   * If omitted, the button resets to `{ page: 1 }` for backwards compatibility.
   */
  onClear?: () => void;
  /** Optional active-filter count for the panel heading. */
  activeCount?: number;
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

const AMOUNT_PRESETS: { label: string; amountMin?: number }[] = [
  { label: "Any" },
  { label: "$1k+", amountMin: 1000 },
  { label: "$10k+", amountMin: 10000 },
  { label: "$50k+", amountMin: 50000 },
  { label: "$100k+", amountMin: 100000 },
];

interface AmountFilterProps {
  amountMin: number | undefined;
  amountMax: number | undefined;
  onChange: (next: { amountMin: number | undefined; amountMax: number | undefined }) => void;
}

function AmountFilter({ amountMin, amountMax, onChange }: Readonly<AmountFilterProps>) {
  const activePreset = (() => {
    if (amountMin === undefined && amountMax === undefined) return "Any";
    const match = AMOUNT_PRESETS.find((p) => p.amountMin === amountMin && amountMax === undefined);
    return match?.label;
  })();

  return (
    <div>
      <div className="block text-sm font-medium text-[var(--muted)] mb-1">Award Amount</div>
      <p className="text-xs text-[var(--muted)] mb-2">
        We match grants whose funding cap is at least this value.
      </p>
      <div className="flex flex-wrap gap-1 mb-2">
        {AMOUNT_PRESETS.map((preset) => {
          const isActive = activePreset === preset.label;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange({ amountMin: preset.amountMin, amountMax: undefined })}
              aria-pressed={isActive}
              className={`px-2 py-1 text-xs rounded-lg border transition-colors ${
                isActive
                  ? "border-[var(--primary)] bg-[var(--info-bg)] text-[var(--primary)]"
                  : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <label className="flex-1">
          <span className="sr-only">Minimum award cap</span>
          <input
            type="number"
            min="0"
            step="1000"
            inputMode="numeric"
            placeholder="Min $"
            aria-describedby="amount-hint"
            value={amountMin ?? ""}
            onChange={(e) => {
              const n = e.target.value ? Number.parseInt(e.target.value, 10) : undefined;
              onChange({
                amountMin: Number.isNaN(n as number) ? undefined : n,
                amountMax,
              });
            }}
            className="w-full px-2 py-1 text-sm rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
          />
        </label>
        <span className="text-xs text-[var(--muted)]">to</span>
        <label className="flex-1">
          <span className="sr-only">Maximum award cap</span>
          <input
            type="number"
            min="0"
            step="1000"
            inputMode="numeric"
            placeholder="Max $"
            aria-describedby="amount-hint"
            value={amountMax ?? ""}
            onChange={(e) => {
              const n = e.target.value ? Number.parseInt(e.target.value, 10) : undefined;
              onChange({
                amountMin,
                amountMax: Number.isNaN(n as number) ? undefined : n,
              });
            }}
            className="w-full px-2 py-1 text-sm rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
          />
        </label>
      </div>
      <p id="amount-hint" className="text-xs text-[var(--muted)] mt-1">
        Amounts in US dollars. &ldquo;Cap&rdquo; is the upper limit of the award range.
      </p>
    </div>
  );
}

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
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-left text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
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
        <fieldset
          id={listboxId}
          className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg py-1 m-0 min-w-0"
        >
          <legend className="sr-only">{label}</legend>
          {options.map((opt) => {
            const checked = values.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-hover)] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleValue(opt.value)}
                  className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--focus-ring)]"
                />
                <span className="truncate">{opt.label}</span>
              </label>
            );
          })}
          {values.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-2 text-xs text-[var(--primary)] hover:bg-[var(--surface-hover)] border-t border-[var(--border)]"
            >
              Clear {label}
            </button>
          )}
        </fieldset>
      )}
    </div>
  );
}

export default function GrantFilters({
  filters,
  onChange,
  onClear,
  activeCount,
}: Readonly<GrantFiltersProps>) {
  const { values: locationOptions } = useMetaValues("/api/meta/locations", "locations");
  const { values: industryOptions } = useMetaValues("/api/meta/industries", "industries");

  const update = <K extends keyof FilterType>(key: K, values: string[]) => {
    onChange({
      ...filters,
      [key]: (values.length ? values : undefined) as FilterType[K],
      page: 1,
    });
  };

  const handleClear = () => {
    if (onClear) onClear();
    else onChange({ page: 1 });
  };

  return (
    <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-4">
      <h3 className="font-semibold text-[var(--foreground)] mb-4">
        Filters
        {activeCount !== undefined && activeCount > 0 && (
          <span className="ml-2 text-sm font-normal text-[var(--muted)]">
            ({activeCount} active)
          </span>
        )}
      </h3>
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
        <Combobox
          label="Location"
          value={filters.location}
          options={locationOptions}
          placeholder="Any location"
          onChange={(next) => onChange({ ...filters, location: next, page: 1 })}
        />
        <Combobox
          label="Industry"
          value={filters.industry}
          options={industryOptions}
          placeholder="Any industry"
          onChange={(next) => onChange({ ...filters, industry: next, page: 1 })}
        />
        <AmountFilter
          amountMin={filters.amountMin}
          amountMax={filters.amountMax}
          onChange={(next) =>
            onChange({
              ...filters,
              amountMin: next.amountMin,
              amountMax: next.amountMax,
              page: 1,
            })
          }
        />
        {(activeCount === undefined || activeCount > 0) && (
          <Button variant="secondary" size="sm" className="w-full" onClick={handleClear}>
            Clear All Filters
          </Button>
        )}
      </div>
    </div>
  );
}
