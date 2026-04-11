import { describe, it, expect, beforeEach, vi } from "vitest";
import { toast, subscribeToToasts, __resetToastsForTest } from "../toast";
import type { ToastMessage } from "../toast";

describe("toast bus", () => {
  beforeEach(() => {
    __resetToastsForTest();
  });

  it("emits success toasts with default duration", () => {
    const received: ToastMessage[] = [];
    subscribeToToasts((t) => received.push(t));
    toast.success("saved");
    expect(received).toHaveLength(1);
    expect(received[0].variant).toBe("success");
    expect(received[0].message).toBe("saved");
    expect(received[0].durationMs).toBe(4000);
  });

  it("emits error toasts", () => {
    const received: ToastMessage[] = [];
    subscribeToToasts((t) => received.push(t));
    toast.error("nope");
    expect(received[0].variant).toBe("error");
  });

  it("honors custom duration", () => {
    const received: ToastMessage[] = [];
    subscribeToToasts((t) => received.push(t));
    toast.info("hello", 1000);
    expect(received[0].durationMs).toBe(1000);
  });

  it("supports multiple listeners", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeToToasts(a);
    subscribeToToasts(b);
    toast.warning("hmm");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes cleanly", () => {
    const fn = vi.fn();
    const unsub = subscribeToToasts(fn);
    unsub();
    toast.success("x");
    expect(fn).not.toHaveBeenCalled();
  });

  it("generates unique ids", () => {
    const received: ToastMessage[] = [];
    subscribeToToasts((t) => received.push(t));
    toast.success("a");
    toast.success("b");
    expect(received[0].id).not.toBe(received[1].id);
  });
});
