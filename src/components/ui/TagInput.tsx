"use client";

import { useId, useRef, useState } from "react";
import Tag from "@/components/ui/Tag";
import { filterOptions } from "@/components/ui/Combobox";

interface TagInputProps {
  /** Current list of tags (order preserved). */
  values: string[];
  onChange: (next: string[]) => void;
  /** Autocomplete suggestions (filtered as the user types). */
  suggestions?: string[];
  placeholder?: string;
  ariaLabel: string;
}

/**
 * Multi-value tag input with optional autocomplete. Enter or comma
 * commits the current draft as a new tag, Backspace on an empty draft
 * pops the last tag. Duplicate values (case-insensitive) are ignored.
 *
 * Intended for admin editing of string[] columns — notably `locations`
 * and `industries` on the Grant model (D.6 in the UX implementation
 * plan). The suggestions list is fed by /api/meta/locations and
 * /api/meta/industries via `useMetaValues`.
 */
export default function TagInput({
  values,
  onChange,
  suggestions = [],
  placeholder,
  ariaLabel,
}: Readonly<TagInputProps>) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const addTag = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const existing = values.some((v) => v.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setDraft("");
      return;
    }
    onChange([...values, trimmed]);
    setDraft("");
    setActiveIndex(0);
  };

  const removeTag = (index: number) => {
    const next = values.slice();
    next.splice(index, 1);
    onChange(next);
    inputRef.current?.focus();
  };

  // Don't suggest tags we've already added.
  const filteredSuggestions = filterOptions(
    suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase())),
    draft,
    20,
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (open && filteredSuggestions[activeIndex]) {
        addTag(filteredSuggestions[activeIndex]);
      } else if (draft.trim()) {
        addTag(draft);
      }
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      e.preventDefault();
      removeTag(values.length - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(filteredSuggestions.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <div
        className="flex flex-wrap items-center gap-2 min-h-[2.5rem] px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] focus-within:ring-2 focus-within:ring-[var(--focus-ring)]"
        aria-label={ariaLabel}
      >
        {values.map((tag, i) => (
          <Tag
            key={`${tag}-${i}`}
            size="sm"
            onRemove={() => removeTag(i)}
            removeLabel={`Remove ${tag}`}
          >
            {tag}
          </Tag>
        ))}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 100)}
          onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? placeholder : ""}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          className="flex-1 min-w-[8rem] bg-transparent text-sm text-[var(--foreground)] focus:outline-none"
        />
      </div>
      {open && filteredSuggestions.length > 0 && (
        // WAI-ARIA combobox autocomplete pattern: requires role="listbox".
        // <datalist>/<select> can't support our free-text commit, styled
        // active option, or mousedown-before-blur behavior.
        <div
          id={listboxId}
          role="listbox" // NOSONAR: WAI-ARIA combobox pattern
          className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg py-1"
        >
          {filteredSuggestions.map((opt, i) => {
            const isActive = i === activeIndex;
            return (
              <div
                key={opt}
                role="option" // NOSONAR: WAI-ARIA combobox pattern
                aria-selected={isActive}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(opt);
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
    </div>
  );
}
