"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

export type DrawerSide = "left" | "right" | "bottom";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: DrawerSide;
  ariaLabel: string;
  title?: string;
  children: ReactNode;
}

export function drawerPanelClass(side: DrawerSide): string {
  const base =
    "relative bg-[var(--card)] border-[var(--border)] shadow-xl p-0 m-0 overflow-y-auto " +
    "text-[var(--foreground)]";
  switch (side) {
    case "left":
      return `${base} border-r h-full w-80 max-w-[85vw]`;
    case "right":
      return `${base} border-l h-full w-80 max-w-[85vw] ml-auto`;
    case "bottom":
      return `${base} border-t w-full max-h-[85vh] rounded-t-2xl mt-auto`;
  }
}

export function drawerContainerClass(side: DrawerSide): string {
  const base = "fixed inset-0 z-50 flex";
  switch (side) {
    case "left":
      return `${base} justify-start`;
    case "right":
      return `${base} justify-end`;
    case "bottom":
      return `${base} items-end`;
  }
}

export default function Drawer({
  open,
  onClose,
  side = "right",
  ariaLabel,
  title,
  children,
}: Readonly<DrawerProps>) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useFocusTrap(dialogRef, open);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    closeRef.current?.focus();
    // Lock body scroll while drawer is open
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className={drawerContainerClass(side)}>
      <button
        type="button"
        aria-label="Close drawer"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <dialog ref={dialogRef} open aria-label={ariaLabel} className={drawerPanelClass(side)}>
        <div className="sticky top-0 z-10 flex items-center justify-between bg-[var(--card)] border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">{title ?? ariaLabel}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <svg
              className="w-5 h-5"
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
        </div>
        <div className="p-4">{children}</div>
      </dialog>
    </div>
  );
}
