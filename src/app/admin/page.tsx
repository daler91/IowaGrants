"use client";

import Link from "next/link";
import { useAdmin } from "@/lib/hooks/useAdmin";

export default function AdminPage() {
  const { admin } = useAdmin();

  return (
    <div>
      <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">
        Admin Dashboard
      </h1>
      {admin && (
        <p className="text-[var(--muted)] mb-8">
          Logged in as {admin.email}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/admin/blacklist"
          className="bg-white rounded-lg border border-[var(--border)] p-6 hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">
            URL Blacklist
          </h2>
          <p className="text-[var(--muted)]">
            Manage blacklisted URLs that the scraper will skip during future scrape runs.
          </p>
        </Link>

        <Link
          href="/admin/invites"
          className="bg-white rounded-lg border border-[var(--border)] p-6 hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">
            Invite Admins
          </h2>
          <p className="text-[var(--muted)]">
            Invite other administrators by sending them a registration link.
          </p>
        </Link>
      </div>
    </div>
  );
}
