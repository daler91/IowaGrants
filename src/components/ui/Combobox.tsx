"use client";

import { useEffect, useId, useRef, useState } from "react";

interface ComboboxProps {
  label: string;
  value: string | undefined;
  options: string[];
  placeholder?: string;
  onChange: (next: string | undefined) => void;
  /** Optional hint rendered below the input */
  hint?: string;
}

/**
 * Case-insensitive substring filter over an options list. Pure and
 * exported so it can be unit-tested under Node.
 */
export function filterOptions(options: string[], query: string, limit = 50): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return options.slice(0, limit);
  return options.filter((o) => o.toLowerCase().includes(q)).slice(0, limit);
}

export default function Combobox({
  label,
  value,
  options,
  placeholder,
  onChange,
  hint,
}: Readonly<ComboboxProps>) {
  // `query` is the visible text. When the caller sets `value` externally
  // (e.g., "Clear all filters"), we reset the draft by comparing against
  // the last observed value during render — React's recommended pattern
  // for syncing external state into local state without an effect.
  const [query, setQuery] = useState(value ?? "");
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setQuery(value ?? "");
  }
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const filtered = filterOptions(options, query);

  const commit = (next: string | undefined) => {
    const normalized = next?.trim();
    onChange(normalized && normalized.length > 0 ? normalized : undefined);
    setQuery(normalized ?? "");
    setOpen(false);
  };

  /**
   * Commit whatever's currently visible. Prefers the highlighted
   * suggestion (when the list is open and one is active) but otherwise
   * commits the raw typed text — crucial when the meta endpoint returns
   * no suggestions (API failure, cold start) or the user wants a value
   * that isn't in the canonical list. The backend accepts any string
   * for `location`/`industry` (array containment), so free text is
   * valid and just filters to empty when no grant matches.
   */
  const commitCurrent = () => {
    if (open && filtered[activeIndex]) {
      commit(filtered[activeIndex]);
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length > 0) {
      commit(trimmed);
    } else if (value) {
      // Field was cleared by typing then deleting — propagate that too.
      commit(undefined);
    } else {
      setOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commitCurrent();
    } else if (e.key === "Escape") {
      // Cancel the in-progress edit and revert the visible text to the
      // last-committed value. Does NOT call onChange.
      e.preventDefault();
      setQuery(value ?? "");
      setOpen(false);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // If focus is moving into a suggestion (mousedown on an <li>), let
    // the option handler commit; don't double-fire. relatedTarget will
    // be inside containerRef in that case.
    if (containerRef.current?.contains(e.relatedTarget as Node | null)) return;
    const trimmed = query.trim();
    if (trimmed === (value ?? "")) {
      setOpen(false);
      return;
    }
    if (trimmed.length === 0) {
      commit(undefined);
    } else {
      commit(trimmed);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-[var(--muted)] mb-1">{label}</label>
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
        />
        {value && (
          <button
            type="button"
            onClick={() => commit(undefined)}
            aria-label={`Clear ${label}`}
            className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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
      {hint && !open && <p className="text-xs text-[var(--muted)] mt-1">{hint}</p>}
      {open && filtered.length > 0 && (
        // WAI-ARIA combobox autocomplete pattern: requires role="listbox".
        // <datalist>/<select> can't support our free-text commit, styled
        // active option, or mousedown-before-blur behavior.
        <div
          id={listboxId}
          role="listbox" // NOSONAR: WAI-ARIA combobox pattern
          className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg py-1"
        >
          {filtered.map((opt, i) => {
            const isActive = i === activeIndex;
            return (
              <div
                key={opt}
                role="option" // NOSONAR: WAI-ARIA combobox pattern
                aria-selected={opt === value}
                onMouseDown={(e) => {
                  // mousedown so it fires before the input blur closes the list
                  e.preventDefault();
                  commit(opt);
                }}
                className={`px-3 py-2 text-sm cursor-pointer ${
                  isActive
                    ? "bg-[var(--surface-hover)] text-[var(--foreground)]"
                    : "text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
                }`}
              >
                {opt}
              </div>
            );
          })}
        </div>
      )}
      {open && filtered.length === 0 && (
        <output className="block absolute z-20 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg px-3 py-2 text-sm text-[var(--muted)]">
          No matches
        </output>
      )}
    </div>
  );
}
