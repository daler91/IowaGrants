"use client";

import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}

export const fieldInputClass =
  "w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--card)] text-[var(--foreground)] " +
  "focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]";

export default function FormField({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  children,
  className,
}: Readonly<FormFieldProps>) {
  const hintId = `${htmlFor}-hint`;
  const errorId = `${htmlFor}-error`;

  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-[var(--foreground)] mb-1">
        {label}
        {required && (
          <span aria-hidden="true" className="text-[var(--danger)] ml-0.5">
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-[var(--muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-[var(--danger-fg)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
