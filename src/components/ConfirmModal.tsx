"use client";

import { useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/Button";

interface ConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
}

export default function ConfirmModal({
  open,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = "Delete",
  loading = false,
}: Readonly<ConfirmModalProps>) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    },
    [onCancel, loading],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      // Auto-focus Cancel button when modal opens
      cancelRef.current?.focus();
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="Close confirmation modal"
        className="absolute inset-0 bg-black/40"
        disabled={loading}
        onClick={onCancel}
      />
      <dialog
        open
        aria-labelledby="confirm-modal-title"
        className="relative bg-[var(--card)] rounded-lg border border-[var(--border)] p-6 shadow-xl max-w-md w-full mx-4"
      >
        <h2
          id="confirm-modal-title"
          className="text-lg font-semibold text-[var(--foreground)] mb-2"
        >
          {title}
        </h2>
        <p className="text-sm text-[var(--muted)] mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={loading}>
            {loading ? "Deleting..." : confirmLabel}
          </Button>
        </div>
      </dialog>
    </div>
  );
}
