"use client";

import { useState, useEffect } from "react";

interface Invite {
  id: string;
  email: string;
  invitedBy: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export default function InvitesPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  const fetchInvites = async () => {
    try {
      const res = await fetch("/api/admin/invites");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setInvites(data.invites);
    } catch {
      setError("Failed to load invites.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvites();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInviteLink("");
    setSending(true);

    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create invite");
        return;
      }

      const data = await res.json();
      const link = `${globalThis.location.origin}/register#token=${data.invite.token}`;
      setInviteLink(link);
      setEmail("");
      fetchInvites();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">
        Invite Admins
      </h1>
      <p className="text-[var(--muted)] mb-8">
        Invite other administrators by sending them a registration link. Invites expire after 72 hours.
      </p>

      <div className="bg-white rounded-lg border border-[var(--border)] p-6 mb-8">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
          Send Invitation
        </h2>
        <form onSubmit={handleInvite} className="flex gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            className="flex-1 px-3 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
          <button
            type="submit"
            disabled={sending}
            className="py-2 px-4 bg-[var(--primary)] text-white rounded-lg font-medium hover:bg-[var(--primary-light)] disabled:opacity-50 transition-colors"
          >
            {sending ? "Sending..." : "Invite"}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {inviteLink && (
          <div className="mt-4 p-3 rounded bg-green-50 border border-green-200">
            <p className="text-sm text-green-700 mb-2">Invite created! Share this link:</p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 text-xs bg-white p-2 rounded border border-green-200 truncate">
                {inviteLink}
              </code>
              <button
                onClick={copyLink}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-[var(--border)]">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            Invitation History
          </h2>
        </div>

        {loading ? (
          <div className="p-6 text-center text-[var(--muted)]">Loading...</div>
        ) : invites.length === 0 ? (
          <div className="p-6 text-center text-[var(--muted)]">No invitations sent yet.</div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {invites.map((invite) => {
              const expired = !invite.usedAt && new Date(invite.expiresAt) < new Date();
              const status = invite.usedAt
                ? "Used"
                : expired
                  ? "Expired"
                  : "Pending";
              const statusColor = invite.usedAt
                ? "text-green-600"
                : expired
                  ? "text-red-600"
                  : "text-amber-600";

              return (
                <div key={invite.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {invite.email}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      Invited by {invite.invitedBy} on{" "}
                      {new Date(invite.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-sm font-medium ${statusColor}`}>
                    {status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
