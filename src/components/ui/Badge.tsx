import type { ReactNode } from "react";

export type BadgeVariant =
  // grant types
  | "type-federal"
  | "type-state"
  | "type-local"
  | "type-private"
  // grant status
  | "status-open"
  | "status-closed"
  | "status-forecasted"
  // demographics
  | "women"
  | "veteran"
  | "minority"
  // business stages
  | "startup"
  | "existing"
  // deadline states
  | "rolling"
  | "urgent"
  // fallback
  | "neutral";

export type BadgeSize = "sm" | "md";

interface BadgeProps {
  variant: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
  className?: string;
}

const VARIANT_TOKENS: Record<BadgeVariant, string> = {
  "type-federal": "bg-[var(--type-federal-bg)] text-[var(--type-federal-fg)]",
  "type-state": "bg-[var(--type-state-bg)] text-[var(--type-state-fg)]",
  "type-local": "bg-[var(--type-local-bg)] text-[var(--type-local-fg)]",
  "type-private": "bg-[var(--type-private-bg)] text-[var(--type-private-fg)]",
  "status-open": "bg-[var(--status-open-bg)] text-[var(--status-open-fg)]",
  "status-closed": "bg-[var(--status-closed-bg)] text-[var(--status-closed-fg)]",
  "status-forecasted": "bg-[var(--status-forecasted-bg)] text-[var(--status-forecasted-fg)]",
  women: "bg-[var(--badge-women-bg)] text-[var(--badge-women-fg)]",
  veteran: "bg-[var(--badge-veteran-bg)] text-[var(--badge-veteran-fg)]",
  minority: "bg-[var(--badge-minority-bg)] text-[var(--badge-minority-fg)]",
  startup: "bg-[var(--badge-startup-bg)] text-[var(--badge-startup-fg)]",
  existing: "bg-[var(--badge-existing-bg)] text-[var(--badge-existing-fg)]",
  rolling: "bg-[var(--badge-rolling-bg)] text-[var(--badge-rolling-fg)]",
  urgent: "bg-[var(--badge-urgent-bg)] text-[var(--badge-urgent-fg)]",
  neutral: "bg-[var(--tag-bg)] text-[var(--tag-fg)]",
};

export function badgeClass(variant: BadgeVariant, size: BadgeSize = "sm", extra = ""): string {
  const base = "inline-flex items-center rounded-full font-medium";
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return [base, sizeClass, VARIANT_TOKENS[variant], extra].filter(Boolean).join(" ");
}

/**
 * Map a grant type enum value to its badge variant. Unknown types fall
 * back to "neutral" so stale data still renders.
 */
export function typeBadgeVariant(grantType: string): BadgeVariant {
  switch (grantType) {
    case "FEDERAL":
      return "type-federal";
    case "STATE":
      return "type-state";
    case "LOCAL":
      return "type-local";
    case "PRIVATE":
      return "type-private";
    default:
      return "neutral";
  }
}

/** Map a (possibly display-computed) grant status to its badge variant. */
export function statusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case "OPEN":
      return "status-open";
    case "CLOSED":
      return "status-closed";
    case "FORECASTED":
      return "status-forecasted";
    default:
      return "neutral";
  }
}

/** Map a demographic/gender focus enum to its badge variant. */
export function demographicBadgeVariant(gender: string): BadgeVariant | null {
  switch (gender) {
    case "WOMEN":
      return "women";
    case "VETERAN":
      return "veteran";
    case "MINORITY":
      return "minority";
    default:
      return null;
  }
}

/** Map a business-stage enum to its badge variant (or null when BOTH). */
export function stageBadgeVariant(stage: string): BadgeVariant | null {
  switch (stage) {
    case "STARTUP":
      return "startup";
    case "EXISTING":
      return "existing";
    default:
      return null;
  }
}

export default function Badge({ variant, size = "sm", children, className }: Readonly<BadgeProps>) {
  return <span className={badgeClass(variant, size, className)}>{children}</span>;
}
