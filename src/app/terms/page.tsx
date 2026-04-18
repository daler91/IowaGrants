import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use — Iowa Grant Scanner",
  description: "Terms governing use of the Iowa Grant Scanner.",
};

export default function TermsPage() {
  return (
    <article className="prose prose-neutral max-w-3xl mx-auto space-y-4 text-[var(--foreground)]">
      <h1 className="text-3xl font-bold">Terms of Use</h1>
      <p className="text-sm text-[var(--muted)]">Last updated: April 17, 2026</p>

      <section>
        <h2 className="text-xl font-semibold mt-6">Purpose</h2>
        <p>
          Iowa Grant Scanner aggregates small-business grant opportunities for Iowa residents. The
          service is free to use and requires no account for browsing.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mt-6">Acceptable use</h2>
        <p>
          You agree not to scrape the service, bypass rate limits, attempt to access administrative
          endpoints without authorization, or submit data that impersonates another party.
          Administrators agree to handle invite tokens and audit logs as confidential.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mt-6">No warranty</h2>
        <p>
          Grant information is aggregated from third-party sources. Deadlines, eligibility criteria,
          and award amounts may be incorrect, outdated, or incomplete. Always verify with the
          grantor before submitting an application. The service is provided &quot;as is&quot;
          without warranty of any kind.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mt-6">Limitation of liability</h2>
        <p>
          The operators are not liable for any damages arising from use of or inability to use the
          service, including but not limited to lost funding opportunities, missed deadlines, or
          reliance on inaccurate data.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mt-6">Changes</h2>
        <p>
          These terms may be updated from time to time. Material changes will be noted on this page.
        </p>
      </section>
    </article>
  );
}
