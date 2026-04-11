/**
 * Shared deadline formatting and status helpers.
 *
 * Both the grant listing card (client-rendered after JSON serialization)
 * and the grant detail page (server-rendered from a Prisma Date) must
 * display the same calendar day for the same value, so all formatting
 * is pinned to the America/Chicago timezone (Iowa).
 */

const GRANT_TIMEZONE = "America/Chicago";
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const URGENT_THRESHOLD_MS = 7 * MS_PER_DAY;

type DeadlineInput = Date | string | null | undefined;

function toDate(deadline: DeadlineInput): Date | null {
  if (!deadline) return null;
  const d = deadline instanceof Date ? deadline : new Date(deadline);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Short-form deadline used on grant cards: "Jan 15, 2025" / "5d left - ..." / "Closed ...". */
export function formatDeadlineShort(deadline: DeadlineInput): string {
  const d = toDate(deadline);
  if (!d) return "No deadline";

  const formatted = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: GRANT_TIMEZONE,
  });

  const diffDays = Math.ceil((d.getTime() - Date.now()) / MS_PER_DAY);
  if (diffDays < 0) return `Closed ${formatted}`;
  if (diffDays <= 30) return `${diffDays}d left - ${formatted}`;
  return formatted;
}

/** Long-form deadline used on the detail page: "Monday, January 15, 2025". */
export function formatDeadlineLong(deadline: DeadlineInput): string {
  const d = toDate(deadline);
  if (!d) return "No deadline specified";

  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: GRANT_TIMEZONE,
  });
}

/** True if the deadline exists and is in the past. */
export function isDeadlinePassed(deadline: DeadlineInput): boolean {
  const d = toDate(deadline);
  return !!d && d.getTime() < Date.now();
}

/** True if the deadline exists, is in the future, and is within 7 days. */
export function isDeadlineUrgent(deadline: DeadlineInput): boolean {
  const d = toDate(deadline);
  if (!d) return false;
  const delta = d.getTime() - Date.now();
  return delta > 0 && delta < URGENT_THRESHOLD_MS;
}

/**
 * Return the whole number of days remaining until the deadline, or null
 * when there is no (parseable) deadline. Past deadlines yield a negative
 * number. Rounding matches `formatDeadlineShort` so the "Nd left" copy
 * agrees with the "Closing in Nd" badge on the urgent UI.
 */
export function daysUntilDeadline(deadline: DeadlineInput): number | null {
  const d = toDate(deadline);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / MS_PER_DAY);
}

/**
 * Short screen-reader and badge label for an urgent deadline.
 * "Closing today" / "Closing tomorrow" / "Closing in Nd".
 * Returns null if the deadline is not urgent.
 */
export function urgencyLabel(deadline: DeadlineInput): string | null {
  if (!isDeadlineUrgent(deadline)) return null;
  const days = daysUntilDeadline(deadline);
  if (days === null) return null;
  if (days <= 0) return "Closing today";
  if (days === 1) return "Closing tomorrow";
  return `Closing in ${days}d`;
}
