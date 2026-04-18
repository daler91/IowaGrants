"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { logError } from "@/lib/errors";

interface CalendarGrant {
  id: string;
  title: string;
  deadline: string;
  grantType: string;
  amount: string | null;
  sourceName: string;
}

const TYPE_DOT_COLORS: Record<string, string> = {
  FEDERAL: "bg-[var(--type-federal-dot)]",
  STATE: "bg-[var(--type-state-dot)]",
  LOCAL: "bg-[var(--type-local-dot)]",
  PRIVATE: "bg-[var(--type-private-dot)]",
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Compose the visual state of a calendar cell. Each attribute contributes
 * independently so a cell that is (e.g.) today, urgent, and selected at
 * once shows all three cues instead of only the highest-priority one.
 *
 * Layering:
 *   - background: urgent > today > hasGrants > empty
 *   - border:     selected overrides background-derived border
 *   - ring:       selected adds an outer ring
 */
function getCellClass(
  isSelected: boolean,
  isUrgent: boolean,
  isToday: boolean,
  hasGrants: boolean,
): string {
  // Background layer (driven by urgency/today/data)
  let background: string;
  if (isUrgent) {
    background = "bg-[var(--danger-bg)]";
  } else if (isToday) {
    background = "bg-[var(--info-bg)]";
  } else if (hasGrants) {
    background = "bg-[var(--card)] hover:bg-[var(--surface-hover)]";
  } else {
    background = "bg-[var(--surface-hover)]/50";
  }

  // Border layer (selected wins, else derived from the background)
  let border: string;
  if (isSelected) {
    border = "border-[var(--primary)]";
  } else if (isUrgent) {
    border = "border-[var(--danger-border)]";
  } else if (isToday) {
    border = "border-[var(--primary-light)]";
  } else if (hasGrants) {
    border = "border-[var(--border)]";
  } else {
    border = "border-transparent";
  }

  // Ring is additive — only on selection.
  const ring = isSelected ? "ring-2 ring-[var(--primary-light)]" : "";

  return `${background} ${border} ${ring}`;
}

/** Pad a 1–12 month number into the `yyyy-mm-dd` prefix. */
function formatDateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function DeadlineCalendar() {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [grants, setGrants] = useState<Record<string, CalendarGrant[]>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Roving tabindex: exactly one cell has tabIndex=0 at any time. On mount
  // this is today because year/month are also initialized to today. When
  // the user navigates months via the header buttons, jumpToMonth() resets
  // focusedDate to the 1st of the new month.
  const [focusedDate, setFocusedDate] = useState<string>(todayStr);

  // When moveFocus() decides to change months, we stash the date string
  // here and an effect moves focus to the matching button after the new
  // grid has rendered.
  const pendingFocusRef = useRef<string | null>(null);
  const cellRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (pendingFocusRef.current) {
      cellRefs.current[pendingFocusRef.current]?.focus();
      pendingFocusRef.current = null;
    }
  });

  useEffect(() => {
    async function fetchCalendar() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/grants/calendar?year=${year}&month=${month}`);
        if (!res.ok) throw new Error("Failed to load calendar data");
        const data = await res.json();
        setGrants(data.grants || {});
      } catch (error) {
        logError("deadline-calendar", "Failed to fetch calendar data", error, { year, month });
        setError("Failed to load calendar data. Please try again.");
        setGrants({});
      } finally {
        setLoading(false);
      }
    }
    fetchCalendar();
  }, [year, month]);

  const jumpToMonth = (y: number, m: number) => {
    setYear(y);
    setMonth(m);
    setSelectedDate(null);
    setFocusedDate(formatDateKey(y, m, 1));
  };

  const prevMonth = () => {
    if (month === 1) jumpToMonth(year - 1, 12);
    else jumpToMonth(year, month - 1);
  };

  const nextMonth = () => {
    if (month === 12) jumpToMonth(year + 1, 1);
    else jumpToMonth(year, month + 1);
  };

  /**
   * Move the roving focus by a delta (days). Updates state so the new
   * cell has tabIndex=0, and queues a programmatic focus after render.
   * When the delta crosses a month boundary, month/year change too.
   */
  const moveFocus = (deltaDays: number) => {
    const [fy, fm, fd] = focusedDate.split("-").map((s) => Number.parseInt(s, 10));
    const next = new Date(fy, fm - 1, fd + deltaDays);
    const ny = next.getFullYear();
    const nm = next.getMonth() + 1;
    const nd = next.getDate();
    const nextKey = formatDateKey(ny, nm, nd);
    setFocusedDate(nextKey);
    pendingFocusRef.current = nextKey;
    if (ny !== year || nm !== month) {
      setYear(ny);
      setMonth(nm);
    }
  };

  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        moveFocus(1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        moveFocus(-1);
        break;
      case "ArrowDown":
        e.preventDefault();
        moveFocus(7);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(-7);
        break;
      case "Home": {
        e.preventDefault();
        // Start of the current week (Sunday)
        const [fy, fm, fd] = focusedDate.split("-").map((s) => Number.parseInt(s, 10));
        const d = new Date(fy, fm - 1, fd);
        moveFocus(-d.getDay());
        break;
      }
      case "End": {
        e.preventDefault();
        // End of the current week (Saturday)
        const [fy, fm, fd] = focusedDate.split("-").map((s) => Number.parseInt(s, 10));
        const d = new Date(fy, fm - 1, fd);
        moveFocus(6 - d.getDay());
        break;
      }
      case "PageUp": {
        e.preventDefault();
        const [fy, fm, fd] = focusedDate.split("-").map((s) => Number.parseInt(s, 10));
        const prev = new Date(fy, fm - 2, fd); // previous month, same day
        const ny = prev.getFullYear();
        const nm = prev.getMonth() + 1;
        const nd = prev.getDate();
        const key = formatDateKey(ny, nm, nd);
        setFocusedDate(key);
        pendingFocusRef.current = key;
        if (ny !== year || nm !== month) {
          setYear(ny);
          setMonth(nm);
        }
        break;
      }
      case "PageDown": {
        e.preventDefault();
        const [fy, fm, fd] = focusedDate.split("-").map((s) => Number.parseInt(s, 10));
        const nextMonthDate = new Date(fy, fm, fd); // next month, same day
        const ny = nextMonthDate.getFullYear();
        const nm = nextMonthDate.getMonth() + 1;
        const nd = nextMonthDate.getDate();
        const key = formatDateKey(ny, nm, nd);
        setFocusedDate(key);
        pendingFocusRef.current = key;
        if (ny !== year || nm !== month) {
          setYear(ny);
          setMonth(nm);
        }
        break;
      }
    }
  };

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: Array<{ day: number | null; dateStr: string; key: string }> = [];

  for (let i = 0; i < firstDay; i++) {
    cells.push({ day: null, dateStr: "", key: `empty-${i}` });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, dateStr, key: dateStr });
  }

  const selectedGrants = selectedDate ? grants[selectedDate] || [] : [];

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            aria-label="Previous month"
            className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h2 className="text-xl font-bold text-[var(--foreground)]">
            {MONTH_NAMES[month - 1]} {year}
          </h2>
          <button
            onClick={nextMonth}
            aria-label="Next month"
            className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_NAMES.map((day) => (
            <div key={day} className="text-center text-xs font-medium text-[var(--muted)] py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {error && (
          <div className="text-center py-12 text-sm text-[var(--danger-fg)] bg-[var(--danger-bg)] rounded-lg border border-[var(--danger-border)]">
            {error}
          </div>
        )}
        {!error && loading && (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, i) => `skeleton-${i}`).map((key) => (
              <div key={key} className="h-20 rounded-lg bg-[var(--surface-hover)] animate-pulse" />
            ))}
          </div>
        )}
        {!error && !loading && (
          <div
            role="grid"
            aria-label={`${MONTH_NAMES[month - 1]} ${year}`}
            className="grid grid-cols-7 gap-1"
            onKeyDown={handleGridKeyDown}
            tabIndex={0}
          >
            {cells.map((cell) => {
              if (cell.day === null) {
                return <div key={cell.key} className="h-20" role="gridcell" />;
              }

              const dayGrants = grants[cell.dateStr] || [];
              const isToday = cell.dateStr === todayStr;
              const isSelected = cell.dateStr === selectedDate;
              const isFocused = cell.dateStr === focusedDate;
              const hasGrants = dayGrants.length > 0;

              // Check if deadline is within 7 days from today
              const dayDate = new Date(cell.dateStr);
              const diffDays = Math.ceil(
                (dayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
              );
              const isUrgent = hasGrants && diffDays >= 0 && diffDays <= 7;

              const deadlineSuffix = dayGrants.length > 1 ? "s" : "";
              const grantsLabel = hasGrants
                ? `, ${dayGrants.length} grant deadline${deadlineSuffix}`
                : "";
              const todayLabel = isToday ? " (today)" : "";
              const urgentLabel = isUrgent ? " (closing soon)" : "";
              const ariaLabel = `${MONTH_NAMES[month - 1]} ${cell.day}${grantsLabel}${todayLabel}${urgentLabel}`;

              return (
                <button
                  key={cell.key}
                  role="gridcell"
                  ref={(el) => {
                    cellRefs.current[cell.dateStr] = el;
                  }}
                  tabIndex={isFocused ? 0 : -1}
                  onClick={() => {
                    setSelectedDate(isSelected ? null : cell.dateStr);
                    setFocusedDate(cell.dateStr);
                  }}
                  aria-label={ariaLabel}
                  aria-selected={isSelected}
                  className={`relative h-20 rounded-lg p-1.5 text-left transition-all border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${getCellClass(isSelected, isUrgent, isToday, hasGrants)}`}
                >
                  {isUrgent && (
                    <span
                      className="absolute top-1 right-1 text-[var(--danger)]"
                      aria-hidden="true"
                      title="Closing soon"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </span>
                  )}
                  <span
                    className={`text-sm font-medium ${
                      isToday ? "text-[var(--primary)]" : "text-[var(--foreground)]"
                    }`}
                  >
                    {cell.day}
                  </span>
                  {hasGrants && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {dayGrants.slice(0, 3).map((g) => (
                        <div
                          key={g.id}
                          className={`w-2 h-2 rounded-full ${TYPE_DOT_COLORS[g.grantType] || "bg-[var(--muted)]"}`}
                          title={g.title}
                        />
                      ))}
                      {dayGrants.length > 3 && (
                        <span className="text-xs text-[var(--muted)]">+{dayGrants.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex gap-4 mt-4 text-xs text-[var(--muted)]">
          {Object.entries(TYPE_DOT_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1">
              <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
              <span>{type.charAt(0) + type.slice(1).toLowerCase()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected date sidebar */}
      <div className="lg:w-80">
        <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-4 sticky top-24">
          <h3 className="font-semibold text-[var(--foreground)] mb-3">
            {selectedDate
              ? new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
              : "Select a date"}
          </h3>

          {!selectedDate && (
            <p className="text-sm text-[var(--muted)]">
              Click a date on the calendar to see grants with that deadline.
            </p>
          )}

          {selectedDate && selectedGrants.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No grant deadlines on this date.</p>
          )}

          <div className="space-y-3">
            {selectedGrants.map((grant) => (
              <Link
                key={grant.id}
                href={`/grants/${grant.id}`}
                className="block p-3 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`w-2 h-2 rounded-full ${TYPE_DOT_COLORS[grant.grantType] || "bg-[var(--muted)]"}`}
                  />
                  <span className="text-xs text-[var(--muted)]">{grant.grantType}</span>
                </div>
                <p className="text-sm font-medium text-[var(--foreground)] line-clamp-2">
                  {grant.title}
                </p>
                {grant.amount && (
                  <p className="text-xs text-[var(--success)] mt-1">{grant.amount}</p>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
