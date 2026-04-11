/**
 * Minimal toast event bus.
 *
 * No external dependency: the Toaster component subscribes to this bus at
 * mount time and renders whatever toasts are in its local state. Anywhere
 * in the app can call `toast.success(...)` etc. without importing React.
 */

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  id: string;
  variant: ToastVariant;
  message: string;
  durationMs: number;
}

type Listener = (toast: ToastMessage) => void;

const listeners = new Set<Listener>();

const DEFAULT_DURATION_MS = 4000;

function emit(variant: ToastVariant, message: string, durationMs?: number): ToastMessage {
  const toastMessage: ToastMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    variant,
    message,
    durationMs: durationMs ?? DEFAULT_DURATION_MS,
  };
  listeners.forEach((listener) => {
    listener(toastMessage);
  });
  return toastMessage;
}

export function subscribeToToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const toast = {
  success(message: string, durationMs?: number) {
    return emit("success", message, durationMs);
  },
  error(message: string, durationMs?: number) {
    return emit("error", message, durationMs);
  },
  warning(message: string, durationMs?: number) {
    return emit("warning", message, durationMs);
  },
  info(message: string, durationMs?: number) {
    return emit("info", message, durationMs);
  },
};

// Exposed for tests only — clears the listener set between runs.
export function __resetToastsForTest(): void {
  listeners.clear();
}
