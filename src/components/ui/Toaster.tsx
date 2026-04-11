"use client";

import { useEffect, useState, useCallback } from "react";
import { subscribeToToasts } from "@/lib/toast";
import type { ToastMessage } from "@/lib/toast";
import { alertContainerClass, alertRole } from "./Alert";

/**
 * Mounts a live-region that renders toasts emitted via `toast.*()`.
 * Place once at the app root in `layout.tsx`.
 */
export default function Toaster() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  useEffect(() => {
    return subscribeToToasts((t) => {
      setMessages((prev) => [...prev, t]);
      if (t.durationMs > 0) {
        setTimeout(() => dismiss(t.id), t.durationMs);
      }
    });
  }, [dismiss]);

  if (messages.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none"
    >
      {messages.map((m) => (
        <div
          key={m.id}
          className={`${alertContainerClass(m.variant)} shadow-lg pointer-events-auto`}
          role={alertRole(m.variant)}
        >
          <div className="flex-1">{m.message}</div>
          <button
            type="button"
            onClick={() => dismiss(m.id)}
            aria-label="Dismiss notification"
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
        </div>
      ))}
    </div>
  );
}
