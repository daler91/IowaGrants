"use client";

import { useEffect, useState } from "react";

interface UseMetaValuesResult {
  values: string[];
}

// Module-level cache so multiple components mounted on the same page share
// a single network fetch per endpoint, even across unmount/remount.
const cache = new Map<string, Promise<Record<string, unknown>>>();

function fetchOnce(endpoint: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const cached = cache.get(endpoint);
  if (cached) return cached;
  const pending = fetch(endpoint, { signal })
    .then((res) => (res.ok ? res.json() : {}))
    .catch((error) => {
      // Don't poison the cache on network failure — allow a retry on next mount.
      cache.delete(endpoint);
      if ((error as { name?: string })?.name === "AbortError") return {};
      return {};
    });
  cache.set(endpoint, pending);
  return pending;
}

/**
 * Fetch a list of distinct values from a meta endpoint once per app session.
 * Results are cached in-module so repeat mounts share a single network round
 * trip. Errors are swallowed — a filter missing its suggestions is strictly
 * a degradation, not a breakage (the user can still type freely).
 */
export function useMetaValues(
  endpoint: string,
  field: "locations" | "industries",
): UseMetaValuesResult {
  const [values, setValues] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    fetchOnce(endpoint, controller.signal).then((data) => {
      if (cancelled) return;
      const list = Array.isArray(data?.[field]) ? (data[field] as string[]) : [];
      setValues(list);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [endpoint, field]);

  return { values };
}
