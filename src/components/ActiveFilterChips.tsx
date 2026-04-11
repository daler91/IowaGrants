"use client";

import type { GrantFilters as FilterType } from "@/lib/types";
import Tag from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { isDefaultStatus } from "@/lib/filter-defaults";
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
    | "location";
  /** The raw value (for multi-valued dimensions). Undefined for search + location. */
  value?: string;
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
    filters.status?.forEach((v) => {
      chips.push({
        key: `status:${v}`,
        label: labelForStatus(v),
        dimension: "status",
        value: v,
      });
    });
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
    case "grantType":
    case "gender":
    case "businessStage":
    case "status":
    case "eligibleExpense": {
      const current = filters[chip.dimension] as string[] | undefined;
      if (!current || !chip.value) return filters;
      const next = current.filter((v) => v !== chip.value);
      return {
        ...filters,
        [chip.dimension]: (next.length ? next : undefined) as FilterType[typeof chip.dimension],
        page: 1,
      };
    }
  }
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
