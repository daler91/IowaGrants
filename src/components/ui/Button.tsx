"use client";

import { forwardRef } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
  className?: string;
}

type ButtonProps = CommonProps & Omit<ComponentPropsWithoutRef<"button">, "className" | "children">;
type LinkButtonProps = CommonProps &
  Omit<ComponentPropsWithoutRef<"a">, "className" | "children" | "href"> & {
    href: string;
  };

// Pure class composition — exported so tests can assert variant→class mapping
// without needing a DOM test environment.
export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra = "",
): string {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] " +
    "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] " +
    "disabled:opacity-50 disabled:cursor-not-allowed";

  const sizeClass = size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm";

  const variantClass = {
    primary: "bg-[var(--primary)] text-[var(--primary-contrast)] hover:bg-[var(--primary-light)]",
    secondary:
      "border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] " +
      "hover:bg-[var(--surface-hover)]",
    danger: "bg-[var(--danger)] text-white hover:bg-[var(--danger-hover)]",
    ghost: "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)]",
  }[variant];

  return [base, sizeClass, variantClass, extra].filter(Boolean).join(" ");
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, children, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      className={buttonClass(variant, size, className)}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});

/**
 * Link styled as a button. Use for navigation actions that need button
 * affordance (e.g., Cancel back-to-list links in admin forms).
 */
export function LinkButton({
  variant = "secondary",
  size = "md",
  loading,
  children,
  className,
  href,
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={buttonClass(variant, size, className)}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </Link>
  );
}
