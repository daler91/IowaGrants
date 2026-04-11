"use client";

import type { ReactNode } from "react";

export type AlertVariant = "success" | "error" | "warning" | "info";

interface AlertProps {
  variant: AlertVariant;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

// Pure variant→class helpers, tested without a DOM environment.
export function alertContainerClass(variant: AlertVariant, extra = ""): string {
  const base = "p-3 rounded-lg border text-sm flex items-start justify-between gap-3";
  const variantClass = {
    success: "bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-fg)]",
    error: "bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-fg)]",
    warning: "bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning-fg)]",
    info: "bg-[var(--info-bg)] border-[var(--info-border)] text-[var(--info-fg)]",
  }[variant];
  return [base, variantClass, extra].filter(Boolean).join(" ");
}

// Errors + warnings use role="alert" (assertive), others use role="status".
export function alertRole(variant: AlertVariant): "alert" | "status" {
  return variant === "error" || variant === "warning" ? "alert" : "status";
}

export default function Alert({ variant, children, onDismiss, className }: Readonly<AlertProps>) {
  return (
    <div className={alertContainerClass(variant, className)} role={alertRole(variant)}>
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
