import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { TYPE_COLORS, STATUS_COLORS } from "@/lib/constants";

/** Only allow http(s) links to prevent javascript: XSS via stored URLs. */
function safeHref(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch { /* invalid URL */ }
  return undefined;
}

// Revalidate cached page every 5 minutes
export const revalidate = 300;

export default async function GrantDetailPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;

  const grant = await prisma.grant.findUnique({
    where: { id },
    include: {
      categories: true,
      eligibleExpenses: true,
    },
  });

  if (!grant) notFound();

  const deadlineStr = grant.deadline
    ? grant.deadline.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "No deadline specified";

  const isUrgent =
    grant.deadline &&
    grant.deadline.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000 &&
    grant.deadline > new Date();

  return (
    <div>
      <Link
        href="/"
        className="text-[var(--primary)] hover:text-[var(--primary-light)] text-sm font-medium mb-6 inline-block"
      >
        &larr; Back to all grants
      </Link>

      <div className="bg-white rounded-lg border border-[var(--border)] p-8">
        <div className="flex flex-wrap gap-2 mb-4">
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${TYPE_COLORS[grant.grantType]}`}
          >
            {grant.grantType}
          </span>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[grant.status]}`}
          >
            {grant.status}
          </span>
          {grant.gender !== "ANY" && grant.gender !== "GENERAL" && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-pink-100 text-pink-800">
              {grant.gender.replace("_", " ")}
            </span>
          )}
          {grant.businessStage !== "BOTH" && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800">
              {grant.businessStage === "STARTUP"
                ? "For Startups"
                : "For Existing Businesses"}
            </span>
          )}
        </div>

        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-4">
          {grant.title}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {grant.amount && (
            <div className="bg-emerald-50 rounded-lg p-4">
              <p className="text-sm text-[var(--muted)] mb-1">Award Amount</p>
              <p className="text-xl font-bold text-[var(--success)]">
                {grant.amount}
              </p>
            </div>
          )}
          <div
            className={`rounded-lg p-4 ${isUrgent ? "bg-red-50" : "bg-gray-50"}`}
          >
            <p className="text-sm text-[var(--muted)] mb-1">Deadline</p>
            <p
              className={`text-lg font-semibold ${isUrgent ? "text-red-600" : "text-[var(--foreground)]"}`}
            >
              {deadlineStr}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-[var(--muted)] mb-1">Source</p>
            <p className="text-lg font-semibold text-[var(--foreground)]">
              {grant.sourceName}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">
              Description
            </h2>
            <p className="text-[var(--muted)] leading-relaxed whitespace-pre-wrap">
              {grant.description}
            </p>
          </div>

          {grant.eligibility && (
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">
                Eligibility
              </h2>
              <p className="text-[var(--muted)] leading-relaxed whitespace-pre-wrap">
                {grant.eligibility}
              </p>
            </div>
          )}

          {grant.eligibleExpenses.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">
                Eligible Use of Funds
              </h2>
              <div className="flex flex-wrap gap-2">
                {grant.eligibleExpenses.map((exp) => (
                  <span
                    key={exp.id}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-blue-800 border border-blue-200"
                  >
                    {exp.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {grant.locations.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">
                Locations
              </h2>
              <div className="flex flex-wrap gap-2">
                {grant.locations.map((loc) => (
                  <span
                    key={loc}
                    className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 text-[var(--foreground)]"
                  >
                    {loc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {grant.industries.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">
                Industries
              </h2>
              <div className="flex flex-wrap gap-2">
                {grant.industries.map((ind) => (
                  <span
                    key={ind}
                    className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 text-[var(--foreground)]"
                  >
                    {ind}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-4 pt-4 border-t border-[var(--border)]">
            {safeHref(grant.sourceUrl) && (
              <a
                href={safeHref(grant.sourceUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-[var(--primary)] text-white rounded-lg font-medium hover:bg-[var(--primary-light)] transition-colors"
              >
                View Original Source
              </a>
            )}
            {grant.pdfUrl && safeHref(grant.pdfUrl) && (
              <a
                href={safeHref(grant.pdfUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 border border-[var(--border)] text-[var(--foreground)] rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Download PDF Guidelines
              </a>
            )}
            {(() => {
              const rawData = grant.rawData as Record<string, unknown> | null;
              const articlePage = rawData?.articlePage as string | undefined;
              const safeArticleHref = articlePage ? safeHref(articlePage) : undefined;
              if (safeArticleHref && articlePage !== grant.sourceUrl) {
                return (
                  <a
                    href={safeArticleHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 border border-[var(--border)] text-[var(--muted)] rounded-lg font-medium hover:bg-gray-50 transition-colors text-sm"
                  >
                    Found via {grant.sourceName}
                  </a>
                );
              }
              return null;
            })()}
          </div>

          <p className="text-xs text-[var(--muted)]">
            Last verified:{" "}
            {grant.lastVerified.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
