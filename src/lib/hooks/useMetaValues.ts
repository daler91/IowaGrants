"use client";

import { useEffect, useState } from "react";

interface UseMetaValuesResult {
  values: string[];
}

/**
 * Fetch a list of distinct values from a meta endpoint once per mount.
 * The endpoint itself is cached via HTTP headers, so repeat mounts share
 * a response. Errors are swallowed — a filter missing its suggestions is
 * strictly a degradation, not a breakage (the user can still type freely).
 *
 * We don't track a `loading` flag because (a) no consumer reads it, and
 * (b) the empty-array initial state renders identically to a "loading"
 * state from the UI's perspective — the combobox just shows no suggestions
 * until the fetch lands.
 */
export function useMetaValues(
  endpoint: string,
  field: "locations" | "industries",
): UseMetaValuesResult {
  const [values, setValues] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(endpoint)
      .then((res) => (res.ok ? res.json() : { [field]: [] }))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.[field]) ? (data[field] as string[]) : [];
        setValues(list);
      })
      .catch(() => {
        if (cancelled) return;
        setValues([]);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, field]);

  return { values };
}
