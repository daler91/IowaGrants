import DeadlineCalendar from "@/components/DeadlineCalendar";

export default function CalendarPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">
          Grant Deadlines
        </h1>
        <p className="text-[var(--muted)]">
          View upcoming grant application deadlines on the calendar. Click a
          date to see grants due that day.
        </p>
      </div>
      <DeadlineCalendar />
    </div>
  );
}
