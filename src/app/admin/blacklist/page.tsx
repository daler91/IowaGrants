"use client";

import { useState, useEffect, useCallback } from "react";

interface BlacklistedUrl {
  id: string;
  url: string;
  reason: string | null;
  blacklistedBy: string;
  createdAt: string;
}

export default function BlacklistPage() {
  const [urls, setUrls] = useState<BlacklistedUrl[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  const [newUrl, setNewUrl] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchUrls = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/blacklist?page=${page}&limit=20`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setUrls(data.urls);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      setError("Failed to load blacklisted URLs.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchUrls();
  }, [fetchUrls]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setAdding(true);

    const urlList = newUrl
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urlList.length === 0) {
      setError("Enter at least one URL.");
      setAdding(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: urlList, reason: reason || undefined }),
      });
      if (!res.ok) throw new Error("Failed to add");
      const data = await res.json();
      const duplicatesText = data.duplicates > 0 ? `, ${data.duplicates} already blacklisted` : "";
      setSuccess(`Added ${data.created} URL(s)${duplicatesText}.`);
      setNewUrl("");
      setReason("");
      fetchUrls();
    } catch {
      setError("Failed to add URLs to blacklist.");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      const res = await fetch("/api/admin/blacklist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!res.ok) throw new Error("Failed to remove");
      fetchUrls();
    } catch {
      setError("Failed to remove URL from blacklist.");
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">URL Blacklist</h1>
      <p className="text-[var(--muted)] mb-8">
        Blacklisted URLs will be skipped by the scraper on future runs.{" "}
        {total > 0 && `${total} URL(s) blacklisted.`}
      </p>

      <div className="bg-white rounded-lg border border-[var(--border)] p-6 mb-8">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
          Add URLs to Blacklist
        </h2>
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label
              htmlFor="urls"
              className="block text-sm font-medium text-[var(--foreground)] mb-1"
            >
              URLs (one per line)
            </label>
            <textarea
              id="urls"
              rows={4}
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder={"https://example.com/grant-page-1\nhttps://example.com/grant-page-2"}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] font-mono text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="reason"
              className="block text-sm font-medium text-[var(--foreground)] mb-1"
            >
              Reason (optional)
            </label>
            <input
              id="reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Not a real grant, duplicate, expired program"
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="py-2 px-4 bg-[var(--primary)] text-white rounded-lg font-medium hover:bg-[var(--primary-light)] disabled:opacity-50 transition-colors"
          >
            {adding ? "Adding..." : "Add to Blacklist"}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 p-3 rounded bg-green-50 border border-green-200 text-sm text-green-700">
            {success}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-[var(--border)]">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Blacklisted URLs</h2>
        </div>

        {loading ? (
          <div className="p-6 text-center text-[var(--muted)]">Loading...</div>
        ) : (
          <>
            {urls.length === 0 ? (
              <div className="p-6 text-center text-[var(--muted)]">No blacklisted URLs yet.</div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {urls.map((item) => (
                  <div key={item.id} className="px-6 py-4 flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-sm font-mono text-[var(--foreground)] truncate"
                        title={item.url}
                      >
                        {item.url}
                      </p>
                      <div className="flex gap-4 mt-1 text-xs text-[var(--muted)]">
                        {item.reason && <span>Reason: {item.reason}</span>}
                        <span>By: {item.blacklistedBy}</span>
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(item.id)}
                      className="text-sm text-red-600 hover:text-red-800 font-medium flex-shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 text-sm border border-[var(--border)] rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-[var(--muted)]">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 text-sm border border-[var(--border)] rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
