"use client";

import type { ReactNode } from "react";

interface TagProps {
  children: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  size?: "sm" | "md";
  className?: string;
}

export function tagClass(size: "sm" | "md" = "md", extra = ""): string {
  const base =
    "inline-flex items-center gap-1.5 rounded-lg bg-[var(--tag-bg)] text-[var(--tag-fg)] font-medium";
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1.5 text-sm";
  return [base, sizeClass, extra].filter(Boolean).join(" ");
}

export default function Tag({
  children,
  onRemove,
  removeLabel,
  size = "md",
  className,
}: Readonly<TagProps>) {
  return (
    <span className={tagClass(size, className)}>
      <span>{children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? "Remove"}
          className="opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
