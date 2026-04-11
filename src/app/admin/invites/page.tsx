"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import { fieldInputClass } from "@/components/ui/FormField";

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
      <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Invite Admins</h1>
      <p className="text-[var(--muted)] mb-8">
        Invite other administrators by sending them a registration link. Invites expire after 72
        hours.
      </p>

      <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6 mb-8">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Send Invitation</h2>
        <form onSubmit={handleInvite} className="flex gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            aria-label="Invitee email"
            className={`${fieldInputClass} flex-1`}
          />
          <Button type="submit" loading={sending}>
            {sending ? "Sending..." : "Invite"}
          </Button>
        </form>

        {error && (
          <div className="mt-4">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        {inviteLink && (
          <div className="mt-4">
            <Alert variant="success">
              <p className="mb-2">Invite created! Share this link:</p>
              <div className="flex gap-2 items-center">
                <code className="flex-1 text-xs bg-[var(--card)] p-2 rounded border border-[var(--success-border)] truncate text-[var(--foreground)]">
                  {inviteLink}
                </code>
                <Button variant="primary" size="sm" onClick={copyLink}>
                  Copy
                </Button>
              </div>
            </Alert>
          </div>
        )}
      </div>

      <div className="bg-[var(--card)] rounded-lg border border-[var(--border)]">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Invitation History</h2>
        </div>

        {renderInviteContent()}
      </div>
    </div>
  );

  function renderInviteContent() {
    if (loading) {
      return <div className="p-6 text-center text-[var(--muted)]">Loading...</div>;
    }
    if (invites.length === 0) {
      return <div className="p-6 text-center text-[var(--muted)]">No invitations sent yet.</div>;
    }
    return (
      <div className="divide-y divide-[var(--border)]">
        {invites.map((invite) => {
          const expired = !invite.usedAt && new Date(invite.expiresAt) < new Date();
          let status = "Pending";
          let statusColor = "text-[var(--warning)]";
          if (invite.usedAt) {
            status = "Used";
            statusColor = "text-[var(--success)]";
          } else if (expired) {
            status = "Expired";
            statusColor = "text-[var(--danger)]";
          }

          return (
            <div key={invite.id} className="px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">{invite.email}</p>
                <p className="text-xs text-[var(--muted)]">
                  Invited by {invite.invitedBy} on {new Date(invite.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span className={`text-sm font-medium ${statusColor}`}>{status}</span>
            </div>
          );
        })}
      </div>
    );
  }
}
