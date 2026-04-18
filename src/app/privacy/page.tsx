import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Iowa Grant Scanner",
  description: "How Iowa Grant Scanner collects, uses, and retains data.",
};

export default function PrivacyPage() {
  return (
    <article className="prose prose-neutral max-w-3xl mx-auto space-y-4 text-[var(--foreground)]">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="text-sm text-[var(--muted)]">Last updated: April 17, 2026</p>

      <section>
        <h2 className="text-xl font-semibold mt-6">What we collect</h2>
        <p>
          The public site does not require an account and does not set analytics, tracking, or
          advertising cookies. The only data we store about visitors is the aggregate IP-based rate
          limit counter in server memory, which is discarded on each deploy.
        </p>
        <p>
          Administrators authenticate with an email and password. We store the email, a bcrypt hash
          of the password (never the plaintext), a display name if provided, and an audit log of
          administrative actions (grants edited, invites sent, bulk deletions).
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mt-6">Grant data</h2>
        <p>
          Grant listings are aggregated from publicly available government and foundation sources.
          Each record stores its source URL so the canonical page remains the source of truth.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mt-6">Third-party processing</h2>
        <p>
          To summarize and validate grant listings we send scraped page text and grant PDFs to
          Anthropic&apos;s API. Applicant-facing fields such as sample applications may appear in
          source PDFs. The scraper applies a best-effort redaction pass to remove US SSN-like
          patterns before sending; no other PII scrubbing is performed. Anthropic&apos;s privacy
          terms apply to that data.
        </p>
        <p>
          When <code>SENTRY_DSN</code> is configured we send unhandled server errors to Sentry for
          observability. Sentry receives stack traces and request metadata, not cookies or request
          bodies.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mt-6">Retention</h2>
        <p>
          Audit log entries are retained for 365 days and then pruned by a scheduled cleanup. Invite
          tokens expire 7 days after creation and are removed from the database 30 days after
          expiry. Closed grants remain in the database for historical reference; their rawData is
          pruned to structured fields only.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mt-6">Admin data access</h2>
        <p>
          Administrators can request a JSON export of their own record and invites they issued via{" "}
          <code>GET /api/admin/me/export</code>, and can delete their account via{" "}
          <code>DELETE /api/admin/me</code>. Deletion removes the account and invalidates every
          outstanding session; it is refused when doing so would leave zero admins.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mt-6">Contact</h2>
        <p>
          Questions about this policy or requests to exercise a data-subject right should be sent to
          the administrator who issued your invite.
        </p>
      </section>
    </article>
  );
}
