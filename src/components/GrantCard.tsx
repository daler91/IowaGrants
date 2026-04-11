import { memo } from "react";
import Link from "next/link";
import type { GrantListItem } from "@/lib/types";
import Badge, {
  typeBadgeVariant,
  statusBadgeVariant,
  demographicBadgeVariant,
  stageBadgeVariant,
} from "@/components/ui/Badge";
import {
  formatDeadlineShort,
  isDeadlinePassed,
  isDeadlineUrgent,
  isRolling,
  urgencyLabel,
} from "@/lib/deadline";

interface GrantCardProps {
  grant: GrantListItem;
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (id: string, selected: boolean) => void;
  onDelete?: (id: string, title: string) => void;
}

export default memo(function GrantCard({
  grant,
  selectable,
  selected,
  onSelectChange,
  onDelete,
}: Readonly<GrantCardProps>) {
  const rolling = isRolling(grant.deadline);
  const deadlineStr = formatDeadlineShort(grant.deadline);
  const deadlinePassed = isDeadlinePassed(grant.deadline);
  const displayStatus = deadlinePassed ? "CLOSED" : grant.status;
  const isUrgent = isDeadlineUrgent(grant.deadline);
  const urgencyText = urgencyLabel(grant.deadline);
  const demographicVariant = demographicBadgeVariant(grant.gender);
  const stageVariant = stageBadgeVariant(grant.businessStage);

  return (
    <Link href={`/grants/${grant.id}`} className="block">
      <div
        className={`relative bg-[var(--card)] rounded-lg border p-5 hover:shadow-md transition-shadow h-full flex flex-col ${selected ? "ring-2 ring-[var(--selected-ring)] border-[var(--selected-border)]" : "border-[var(--border)]"}`}
      >
        {selectable && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
            <button
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete?.(grant.id, grant.title);
              }}
              className="p-1 rounded text-[var(--muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              aria-label={`Delete ${grant.title}`}
              title="Delete grant"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
            <input
              type="checkbox"
              checked={selected || false}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                e.stopPropagation();
                onSelectChange?.(grant.id, e.target.checked);
              }}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
              }}
              className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] cursor-pointer"
            />
          </div>
        )}
        <div className="flex flex-wrap gap-2 mb-3">
          <Badge variant={typeBadgeVariant(grant.grantType)}>{grant.grantType}</Badge>
          <Badge variant={statusBadgeVariant(displayStatus)}>{displayStatus}</Badge>
          {rolling && <Badge variant="rolling">Rolling</Badge>}
          {demographicVariant && (
            <Badge variant={demographicVariant}>{grant.gender.replace("_", " ")}</Badge>
          )}
          {stageVariant && (
            <Badge variant={stageVariant}>
              {grant.businessStage === "STARTUP" ? "Startup" : "Existing Biz"}
            </Badge>
          )}
        </div>

        <h3 className="font-semibold text-[var(--foreground)] mb-2 line-clamp-2">{grant.title}</h3>

        <p className="text-sm text-[var(--muted)] mb-3 line-clamp-3 flex-grow">
          {grant.description}
        </p>

        <div className="space-y-2 mt-auto">
          {grant.amount && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--muted)]">Amount:</span>
              <span className="font-medium text-[var(--success)]">{grant.amount}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">Deadline:</span>
            <span
              className={`font-medium ${isUrgent ? "text-[var(--danger)]" : "text-[var(--foreground)]"}`}
            >
              {rolling ? "Rolling — apply any time" : deadlineStr}
            </span>
            {urgencyText && (
              <Badge variant="urgent">
                <svg
                  className="w-3 h-3 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {urgencyText}
              </Badge>
            )}
          </div>

          {grant.eligibleExpenses.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {grant.eligibleExpenses.slice(0, 3).map((exp) => (
                <span
                  key={exp.name}
                  className="px-1.5 py-0.5 rounded text-xs bg-[var(--tag-bg)] text-[var(--muted)]"
                >
                  {exp.label}
                </span>
              ))}
              {grant.eligibleExpenses.length > 3 && (
                <span className="px-1.5 py-0.5 rounded text-xs bg-[var(--tag-bg)] text-[var(--muted)]">
                  +{grant.eligibleExpenses.length - 3} more
                </span>
              )}
            </div>
          )}

          <div className="text-xs text-[var(--muted)] pt-1 border-t border-[var(--border)]">
            Source: {grant.sourceName} | {grant.locations.join(", ")}
          </div>
        </div>
      </div>
    </Link>
  );
});
