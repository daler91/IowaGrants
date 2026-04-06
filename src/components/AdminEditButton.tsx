"use client";

import Link from "next/link";
import { useAdmin } from "@/lib/hooks/useAdmin";

export default function AdminEditButton({ grantId }: Readonly<{ grantId: string }>) {
  const { isAuthenticated, loading } = useAdmin();

  if (loading || !isAuthenticated) return null;

  return (
    <Link
      href={`/admin/grants/${grantId}/edit`}
      className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:text-[var(--primary-light)] font-medium"
    >
      Edit Grant
    </Link>
  );
}
