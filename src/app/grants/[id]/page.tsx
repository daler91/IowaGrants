import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import Badge, {
  typeBadgeVariant,
  statusBadgeVariant,
  demographicBadgeVariant,
  stageBadgeVariant,
} from "@/components/ui/Badge";
import { parseRawData } from "@/lib/ai/schemas";
import { formatDeadlineLong, isDeadlinePassed, isDeadlineUrgent } from "@/lib/deadline";
import AdminEditButton from "@/components/AdminEditButton";

/** Only allow http(s) links to prevent javascript: XSS via stored URLs. */
function safeHref(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch {
    /* invalid URL */
  }
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

  const deadlineStr = formatDeadlineLong(grant.deadline);
  const isUrgent = isDeadlineUrgent(grant.deadline);
  const deadlinePassed = isDeadlinePassed(grant.deadline);
  const displayStatus = deadlinePassed ? "CLOSED" : grant.status;

  const rawData = parseRawData(grant.rawData);
  const deadlineSource = rawData?.deadlineSource;
  const showDeadlineHint =
    !!grant.deadline &&
    deadlineSource &&
    typeof deadlineSource === "object" &&
    "confidence" in deadlineSource &&
    deadlineSource.confidence !== "HIGH";

  return (
    <div>
      <Link
        href="/"
        className="text-[var(--primary)] hover:text-[var(--primary-light)] text-sm font-medium mb-6 inline-block"
      >
        &larr; Back to all grants
      </Link>

      <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-8">
        {(() => {
          const demographicVariant = demographicBadgeVariant(grant.gender);
          const stageVariant = stageBadgeVariant(grant.businessStage);
          return (
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant={typeBadgeVariant(grant.grantType)} size="md">
                {grant.grantType}
              </Badge>
              <Badge variant={statusBadgeVariant(displayStatus)} size="md">
                {displayStatus}
              </Badge>
              {demographicVariant && (
                <Badge variant={demographicVariant} size="md">
                  {grant.gender.replace("_", " ")}
                </Badge>
              )}
              {stageVariant && (
                <Badge variant={stageVariant} size="md">
                  {grant.businessStage === "STARTUP" ? "For Startups" : "For Existing Businesses"}
                </Badge>
              )}
            </div>
          );
        })()}

        <div className="flex items-start justify-between gap-4 mb-4">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{grant.title}</h1>
          <AdminEditButton grantId={id} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {grant.amount && (
            <div className="bg-[var(--success-bg)] rounded-lg p-4">
              <p className="text-sm text-[var(--muted)] mb-1">Award Amount</p>
              <p className="text-xl font-bold text-[var(--success)]">{grant.amount}</p>
            </div>
          )}
          <div
            className={`rounded-lg p-4 ${isUrgent ? "bg-[var(--danger-bg)]" : "bg-[var(--surface-hover)]"}`}
          >
            <p className="text-sm text-[var(--muted)] mb-1">Deadline</p>
            <p
              className={`text-lg font-semibold ${isUrgent ? "text-[var(--danger)]" : "text-[var(--foreground)]"}`}
            >
              {deadlineStr}
            </p>
            {showDeadlineHint && (
              <p className="text-xs text-[var(--muted)] mt-1 italic">
                Auto-extracted — verify at the original source.
              </p>
            )}
          </div>
          <div className="bg-[var(--surface-hover)] rounded-lg p-4">
            <p className="text-sm text-[var(--muted)] mb-1">Source</p>
            <p className="text-lg font-semibold text-[var(--foreground)]">{grant.sourceName}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Description</h2>
            <p className="text-[var(--muted)] leading-relaxed whitespace-pre-wrap">
              {grant.description}
            </p>
          </div>

          {grant.eligibility && (
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Eligibility</h2>
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
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--info-bg)] text-[var(--info-fg)] border border-[var(--info-border)]"
                  >
                    {exp.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {grant.locations.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Locations</h2>
              <div className="flex flex-wrap gap-2">
                {grant.locations.map((loc) => (
                  <span
                    key={loc}
                    className="px-3 py-1.5 rounded-lg text-sm bg-[var(--tag-bg)] text-[var(--tag-fg)]"
                  >
                    {loc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {grant.industries.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Industries</h2>
              <div className="flex flex-wrap gap-2">
                {grant.industries.map((ind) => (
                  <span
                    key={ind}
                    className="px-3 py-1.5 rounded-lg text-sm bg-[var(--tag-bg)] text-[var(--tag-fg)]"
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
                className="px-6 py-3 bg-[var(--primary)] text-[var(--primary-contrast)] rounded-lg font-medium hover:bg-[var(--primary-light)] transition-colors"
              >
                View Original Source
              </a>
            )}
            {grant.pdfUrl && safeHref(grant.pdfUrl) && (
              <a
                href={safeHref(grant.pdfUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 border border-[var(--border)] text-[var(--foreground)] rounded-lg font-medium hover:bg-[var(--surface-hover)] transition-colors"
              >
                Download PDF Guidelines
              </a>
            )}
            {(() => {
              const articlePage = rawData?.articlePage;
              const safeArticleHref = articlePage ? safeHref(articlePage) : undefined;
              if (safeArticleHref && articlePage !== grant.sourceUrl) {
                return (
                  <a
                    href={safeArticleHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 border border-[var(--border)] text-[var(--muted)] rounded-lg font-medium hover:bg-[var(--surface-hover)] transition-colors text-sm"
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
