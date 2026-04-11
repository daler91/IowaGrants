"use client";

import type { GrantFilters as FilterType } from "@/lib/types";
import Tag from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { DEFAULT_STATUS_FILTER, isDefaultStatus } from "@/lib/filter-defaults";

/**
 * Sentinel value we attach to the "All statuses" chip so
 * removeChipFromFilters knows to restore the default set instead of
 * filtering an array by it.
 */
export const ALL_STATUSES_SENTINEL = "__all_statuses__";
import {
  labelForBusinessStage,
  labelForExpense,
  labelForGender,
  labelForGrantType,
  labelForStatus,
} from "@/lib/filter-labels";

/**
 * A single chip to render: which filter dimension it belongs to, what label
 * to show, and what the new filter shape should look like after removal.
 * Pure data, not JSX — makes it easy to unit test without a DOM.
 */
export interface ActiveChip {
  /** Stable key for React and for tests. */
  key: string;
  /** User-facing label. */
  label: string;
  /** The dimension this chip represents. "search" is a synthetic dimension. */
  dimension:
    | "search"
    | "grantType"
    | "gender"
    | "businessStage"
    | "status"
    | "eligibleExpense"
    | "location"
    | "industry"
    | "amount";
  /** The raw value (for multi-valued dimensions). Undefined for search + location. */
  value?: string;
}

/**
 * Format the amount range as a compact chip label. Only called when at
 * least one of amountMin/amountMax is set.
 */
export function formatAmountChip(min: number | undefined, max: number | undefined): string {
  const fmt = (n: number): string => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
    return `$${n}`;
  };
  if (min !== undefined && max !== undefined) return `Amount: ${fmt(min)}–${fmt(max)}`;
  if (min !== undefined) return `Amount: ${fmt(min)}+`;
  if (max !== undefined) return `Amount: up to ${fmt(max)}`;
  return "Amount";
}

/**
 * Turn the current filter/search state into a list of removable chips.
 * Default status is intentionally omitted so the UI doesn't suggest the
 * user needs to "clear" something they never picked.
 */
export function computeActiveChips(filters: FilterType, search: string): ActiveChip[] {
  const chips: ActiveChip[] = [];

  if (search) {
    chips.push({ key: "search", label: `"${search}"`, dimension: "search" });
  }

  filters.grantType?.forEach((v) => {
    chips.push({
      key: `grantType:${v}`,
      label: labelForGrantType(v),
      dimension: "grantType",
      value: v,
    });
  });

  filters.gender?.forEach((v) => {
    chips.push({ key: `gender:${v}`, label: labelForGender(v), dimension: "gender", value: v });
  });

  filters.businessStage?.forEach((v) => {
    chips.push({
      key: `businessStage:${v}`,
      label: labelForBusinessStage(v),
      dimension: "businessStage",
      value: v,
    });
  });

  if (!isDefaultStatus(filters.status)) {
    const status = filters.status;
    if (!status || status.length === 0) {
      // User deliberately un-set the default status via "Clear Status"
      // in the MultiSelect. The backend now returns *every* status, so
      // the user is seeing closed + open + forecasted. Surface this as
      // a removable chip so they aren't silently viewing more than the
      // default while activeFilterCount reports 0.
      chips.push({
        key: "status:all",
        label: "All statuses",
        dimension: "status",
        value: ALL_STATUSES_SENTINEL,
      });
    } else {
      status.forEach((v) => {
        chips.push({
          key: `status:${v}`,
          label: labelForStatus(v),
          dimension: "status",
          value: v,
        });
      });
    }
  }

  filters.eligibleExpense?.forEach((v) => {
    chips.push({
      key: `eligibleExpense:${v}`,
      label: labelForExpense(v),
      dimension: "eligibleExpense",
      value: v,
    });
  });

  if (filters.location) {
    chips.push({
      key: `location:${filters.location}`,
      label: filters.location,
      dimension: "location",
    });
  }

  if (filters.industry) {
    chips.push({
      key: `industry:${filters.industry}`,
      label: filters.industry,
      dimension: "industry",
    });
  }

  if (filters.amountMin !== undefined || filters.amountMax !== undefined) {
    chips.push({
      key: `amount:${filters.amountMin ?? ""}-${filters.amountMax ?? ""}`,
      label: formatAmountChip(filters.amountMin, filters.amountMax),
      dimension: "amount",
    });
  }

  return chips;
}

interface ActiveFilterChipsProps {
  filters: FilterType;
  search: string;
  onFiltersChange: (next: FilterType) => void;
  onSearchChange: (next: string) => void;
  onClearAll: () => void;
}

/**
 * Return a new filter shape with the given chip removed. Exported for tests.
 */
export function removeChipFromFilters(filters: FilterType, chip: ActiveChip): FilterType {
  switch (chip.dimension) {
    case "search":
      // Search lives in a sibling state slot; the caller handles this branch.
      return filters;
    case "location":
      return { ...filters, location: undefined, page: 1 };
    case "industry":
      return { ...filters, industry: undefined, page: 1 };
    case "amount":
      return { ...filters, amountMin: undefined, amountMax: undefined, page: 1 };
    case "status":
      // Removing the "All statuses" sentinel means "go back to the
      // default Open + Forecasted view" — the inverse of clicking
      // Clear Status in the MultiSelect.
      if (chip.value === ALL_STATUSES_SENTINEL) {
        return {
          ...filters,
          status: [...DEFAULT_STATUS_FILTER] as NonNullable<FilterType["status"]>,
          page: 1,
        };
      }
      return removeFromMultiValue(filters, "status", chip.value);
    case "grantType":
    case "gender":
    case "businessStage":
    case "eligibleExpense":
      return removeFromMultiValue(filters, chip.dimension, chip.value);
  }
}

function removeFromMultiValue<
  K extends "grantType" | "gender" | "businessStage" | "status" | "eligibleExpense",
>(filters: FilterType, dimension: K, value: string | undefined): FilterType {
  const current = filters[dimension] as string[] | undefined;
  if (!current || !value) return filters;
  const next = current.filter((v) => v !== value);
  return {
    ...filters,
    [dimension]: (next.length ? next : undefined) as FilterType[K],
    page: 1,
  };
}

export default function ActiveFilterChips({
  filters,
  search,
  onFiltersChange,
  onSearchChange,
  onClearAll,
}: Readonly<ActiveFilterChipsProps>) {
  const chips = computeActiveChips(filters, search);
  if (chips.length === 0) return null;

  const handleRemove = (chip: ActiveChip) => {
    if (chip.dimension === "search") {
      onSearchChange("");
      return;
    }
    onFiltersChange(removeChipFromFilters(filters, chip));
  };

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-2"
      aria-label={`Active filters, ${chips.length}`}
    >
      <span className="text-sm text-[var(--muted)] mr-1">Filtering by:</span>
      {chips.map((chip) => (
        <Tag
          key={chip.key}
          size="sm"
          onRemove={() => handleRemove(chip)}
          removeLabel={`Remove ${chip.label}`}
        >
          {chip.label}
        </Tag>
      ))}
      <Button variant="ghost" size="sm" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}
