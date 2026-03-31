import Link from "next/link";

interface GrantCardGrant {
  id: string;
  title: string;
  description: string;
  sourceName: string;
  grantType: string;
  status: string;
  gender: string;
  businessStage: string;
  amount?: string | null;
  deadline?: string | null;
  locations: string[];
  eligibleExpenses: { name: string; label: string }[];
}

const TYPE_COLORS: Record<string, string> = {
  FEDERAL: "bg-blue-100 text-blue-800",
  STATE: "bg-green-100 text-green-800",
  LOCAL: "bg-orange-100 text-orange-800",
  PRIVATE: "bg-purple-100 text-purple-800",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-red-100 text-red-800",
  FORECASTED: "bg-amber-100 text-amber-800",
};

function formatDeadline(deadline: string | null | undefined): string {
  if (!deadline) return "No deadline";
  const d = new Date(deadline);
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const formatted = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (diff < 0) return `Closed ${formatted}`;
  if (diff <= 7) return `${diff}d left - ${formatted}`;
  if (diff <= 30) return `${diff}d left - ${formatted}`;
  return formatted;
}

export default function GrantCard({ grant }: { grant: GrantCardGrant }) {
  const deadlineStr = formatDeadline(grant.deadline);
  const isUrgent =
    grant.deadline &&
    new Date(grant.deadline).getTime() - Date.now() <
      7 * 24 * 60 * 60 * 1000 &&
    new Date(grant.deadline) > new Date();

  return (
    <Link href={`/grants/${grant.id}`} className="block">
      <div className="bg-white rounded-lg border border-[var(--border)] p-5 hover:shadow-md transition-shadow h-full flex flex-col">
        <div className="flex flex-wrap gap-2 mb-3">
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[grant.grantType] || "bg-gray-100 text-gray-800"}`}
          >
            {grant.grantType}
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[grant.status] || "bg-gray-100 text-gray-800"}`}
          >
            {grant.status}
          </span>
          {grant.gender !== "ANY" && grant.gender !== "GENERAL" && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-pink-100 text-pink-800">
              {grant.gender.replace("_", " ")}
            </span>
          )}
          {grant.businessStage !== "BOTH" && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
              {grant.businessStage === "STARTUP"
                ? "Startup"
                : "Existing Biz"}
            </span>
          )}
        </div>

        <h3 className="font-semibold text-[var(--foreground)] mb-2 line-clamp-2">
          {grant.title}
        </h3>

        <p className="text-sm text-[var(--muted)] mb-3 line-clamp-3 flex-grow">
          {grant.description}
        </p>

        <div className="space-y-2 mt-auto">
          {grant.amount && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--muted)]">Amount:</span>
              <span className="font-medium text-[var(--success)]">
                {grant.amount}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">Deadline:</span>
            <span
              className={`font-medium ${isUrgent ? "text-red-600" : "text-[var(--foreground)]"}`}
            >
              {deadlineStr}
            </span>
          </div>

          {grant.eligibleExpenses.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {grant.eligibleExpenses.slice(0, 3).map((exp) => (
                <span
                  key={exp.name}
                  className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600"
                >
                  {exp.label}
                </span>
              ))}
              {grant.eligibleExpenses.length > 3 && (
                <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
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
}
