"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";

interface ScrapeRun {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  grantsFound: number;
  grantsNew: number;
}

interface ScrapeStatusResponse {
  scrape: ScrapeRun | null;
  recent: ScrapeRun[];
}

const POLL_INTERVAL_MS = 5000;

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatDuration(start: string, end: string | null): string {
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    running: "bg-[var(--info-bg)] text-[var(--info-fg)] border-[var(--info-border)]",
    completed: "bg-[var(--success-bg)] text-[var(--success-fg)] border-[var(--success-border)]",
    failed: "bg-[var(--danger-bg)] text-[var(--danger-fg)] border-[var(--danger-border)]",
  };
  const cls =
    classes[status] ?? "bg-[var(--surface-hover)] text-[var(--foreground)] border-[var(--border)]";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}
    >
      {status}
    </span>
  );
}

export default function ScansPage() {
  const [latest, setLatest] = useState<ScrapeRun | null>(null);
  const [recent, setRecent] = useState<ScrapeRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/scraper");
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as ScrapeStatusResponse;
      setLatest(data.scrape);
      setRecent(data.recent ?? []);
    } catch {
      toast.error("Failed to load scan status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const isRunning = latest?.status === "running";

  useEffect(() => {
    if (!isRunning) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isRunning, fetchStatus]);

  const handleStart = async () => {
    setStarting(true);
    try {
      const res = await fetch("/api/scraper", { method: "POST" });
      if (res.status === 409) {
        toast.warning("A scan is already in progress.");
        await fetchStatus();
        return;
      }
      if (!res.ok) throw new Error("Failed to start scan");
      toast.success("Scan started.");
      await fetchStatus();
    } catch {
      toast.error("Failed to start scan.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Scan Grants</h1>
      <p className="text-[var(--muted)] mb-8">
        Start a new grant scan and monitor the latest runs. Scans take several minutes to complete.
      </p>

      <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6 mb-8">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">Current status</h2>
            {loading ? (
              <p className="text-sm text-[var(--muted)]">Loading…</p>
            ) : latest ? (
              <div className="flex items-center gap-3">
                <StatusBadge status={latest.status} />
                <span className="text-sm text-[var(--muted)]">
                  Started {formatDateTime(latest.startedAt)}
                </span>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">No scans have been run yet.</p>
            )}
          </div>
          <Button onClick={handleStart} loading={starting} disabled={isRunning || starting}>
            {isRunning ? "Scan in progress…" : starting ? "Starting…" : "Start new scan"}
          </Button>
        </div>

        {latest && (
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-[var(--muted)]">Grants found</dt>
              <dd className="text-[var(--foreground)] font-medium">{latest.grantsFound}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">New grants</dt>
              <dd className="text-[var(--foreground)] font-medium">{latest.grantsNew}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Duration</dt>
              <dd className="text-[var(--foreground)] font-medium">
                {formatDuration(latest.startedAt, latest.completedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Completed</dt>
              <dd className="text-[var(--foreground)] font-medium">
                {formatDateTime(latest.completedAt)}
              </dd>
            </div>
            {latest.error && (
              <div className="col-span-2 md:col-span-4">
                <dt className="text-[var(--muted)]">Error</dt>
                <dd className="text-[var(--danger-fg)] font-mono text-xs break-words">
                  {latest.error}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>

      <div className="bg-[var(--card)] rounded-lg border border-[var(--border)]">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Recent scans</h2>
        </div>
        {loading ? (
          <div className="p-6 text-center text-[var(--muted)]">Loading…</div>
        ) : recent.length === 0 ? (
          <div className="p-6 text-center text-[var(--muted)]">No scan history yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Started</th>
                  <th className="px-6 py-3 font-medium">Duration</th>
                  <th className="px-6 py-3 font-medium text-right">Grants found</th>
                  <th className="px-6 py-3 font-medium text-right">New</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((run) => (
                  <tr key={run.id} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-6 py-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-6 py-3 text-[var(--foreground)]">
                      {formatDateTime(run.startedAt)}
                    </td>
                    <td className="px-6 py-3 text-[var(--foreground)]">
                      {formatDuration(run.startedAt, run.completedAt)}
                    </td>
                    <td className="px-6 py-3 text-right text-[var(--foreground)]">
                      {run.grantsFound}
                    </td>
                    <td className="px-6 py-3 text-right text-[var(--foreground)]">
                      {run.grantsNew}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
