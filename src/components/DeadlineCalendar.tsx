"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface CalendarGrant {
  id: string;
  title: string;
  deadline: string;
  grantType: string;
  amount: string | null;
  sourceName: string;
}

const TYPE_DOT_COLORS: Record<string, string> = {
  FEDERAL: "bg-blue-500",
  STATE: "bg-green-500",
  LOCAL: "bg-orange-500",
  PRIVATE: "bg-purple-500",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getCellBorderClass(isSelected: boolean, isUrgent: boolean, isToday: boolean, hasGrants: boolean): string {
  if (isSelected) return "border-[var(--primary)] bg-blue-50 ring-2 ring-[var(--primary-light)]";
  if (isUrgent) return "border-red-200 bg-red-50";
  if (isToday) return "border-[var(--primary-light)] bg-blue-50";
  if (hasGrants) return "border-[var(--border)] bg-white hover:bg-gray-50";
  return "border-transparent bg-gray-50/50";
}

export default function DeadlineCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [grants, setGrants] = useState<Record<string, CalendarGrant[]>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCalendar() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/grants/calendar?year=${year}&month=${month}`
        );
        if (!res.ok) throw new Error("Failed to load calendar data");
        const data = await res.json();
        setGrants(data.grants || {});
      } catch (error) {
        console.error("Failed to fetch calendar:", error);
        setError("Failed to load calendar data. Please try again.");
        setGrants({});
      } finally {
        setLoading(false);
      }
    }
    fetchCalendar();
  }, [year, month]);

  const prevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
    setSelectedDate(null);
  };

  const nextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
    setSelectedDate(null);
  };

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = today.toISOString().split("T")[0];

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
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-xl font-bold text-[var(--foreground)]">
            {MONTH_NAMES[month - 1]} {year}
          </h2>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_NAMES.map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium text-[var(--muted)] py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {error ? (
          <div className="text-center py-12 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
            {error}
          </div>
        ) : loading ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, i) => `skeleton-${i}`).map((key) => (
              <div
                key={key}
                className="h-20 rounded-lg bg-gray-50 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              if (cell.day === null) {
                return <div key={cell.key} className="h-20" />;
              }

              const dayGrants = grants[cell.dateStr] || [];
              const isToday = cell.dateStr === todayStr;
              const isSelected = cell.dateStr === selectedDate;
              const hasGrants = dayGrants.length > 0;

              // Check if deadline is within 7 days from today
              const dayDate = new Date(cell.dateStr);
              const diffDays = Math.ceil(
                (dayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
              );
              const isUrgent = hasGrants && diffDays >= 0 && diffDays <= 7;

              return (
                <button
                  key={cell.key}
                  onClick={() =>
                    setSelectedDate(
                      isSelected ? null : cell.dateStr
                    )
                  }
                  className={`h-20 rounded-lg p-1.5 text-left transition-all border ${getCellBorderClass(isSelected, isUrgent, isToday, hasGrants)}`}
                >
                  <span
                    className={`text-sm font-medium ${
                      isToday
                        ? "text-[var(--primary)]"
                        : "text-[var(--foreground)]"
                    }`}
                  >
                    {cell.day}
                  </span>
                  {hasGrants && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {dayGrants.slice(0, 3).map((g) => (
                        <div
                          key={g.id}
                          className={`w-2 h-2 rounded-full ${TYPE_DOT_COLORS[g.grantType] || "bg-gray-400"}`}
                          title={g.title}
                        />
                      ))}
                      {dayGrants.length > 3 && (
                        <span className="text-xs text-[var(--muted)]">
                          +{dayGrants.length - 3}
                        </span>
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
        <div className="bg-white rounded-lg border border-[var(--border)] p-4 sticky top-24">
          <h3 className="font-semibold text-[var(--foreground)] mb-3">
            {selectedDate
              ? new Date(selectedDate + "T12:00:00").toLocaleDateString(
                  "en-US",
                  { weekday: "long", month: "long", day: "numeric" }
                )
              : "Select a date"}
          </h3>

          {!selectedDate && (
            <p className="text-sm text-[var(--muted)]">
              Click a date on the calendar to see grants with that deadline.
            </p>
          )}

          {selectedDate && selectedGrants.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              No grant deadlines on this date.
            </p>
          )}

          <div className="space-y-3">
            {selectedGrants.map((grant) => (
              <Link
                key={grant.id}
                href={`/grants/${grant.id}`}
                className="block p-3 rounded-lg border border-[var(--border)] hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`w-2 h-2 rounded-full ${TYPE_DOT_COLORS[grant.grantType] || "bg-gray-400"}`}
                  />
                  <span className="text-xs text-[var(--muted)]">
                    {grant.grantType}
                  </span>
                </div>
                <p className="text-sm font-medium text-[var(--foreground)] line-clamp-2">
                  {grant.title}
                </p>
                {grant.amount && (
                  <p className="text-xs text-[var(--success)] mt-1">
                    {grant.amount}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
