"use client";

import { LinkButton } from "@/components/ui/Button";
import { useAdmin } from "@/lib/hooks/useAdmin";

export default function AdminEditButton({ grantId }: Readonly<{ grantId: string }>) {
  const { isAuthenticated, loading } = useAdmin();

  if (loading || !isAuthenticated) return null;

  return (
    <LinkButton
      href={`/admin/grants/${grantId}/edit`}
      variant="secondary"
      size="sm"
      aria-label="Edit this grant"
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
        />
      </svg>
      Edit
    </LinkButton>
  );
}
