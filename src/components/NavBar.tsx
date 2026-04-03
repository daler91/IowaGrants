"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAdmin } from "@/lib/hooks/useAdmin";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/calendar", label: "Deadlines" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, loading, clearAdmin } = useAdmin();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    clearAdmin();
    router.push("/");
    router.refresh();
  };

  return (
    <nav
      className="bg-white border-b border-[var(--border)] sticky top-0 z-50"
      aria-label="Main navigation"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-bold text-[var(--primary)]">
              Iowa Grant Scanner
            </span>
          </Link>
          <div className="flex gap-6 items-center">
            {NAV_LINKS.map(({ href, label }) => {
              const isActive =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={`font-medium transition-colors ${
                    isActive
                      ? "text-[var(--primary)] border-b-2 border-[var(--primary)]"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
            {!loading && isAuthenticated && (
              <>
                <Link
                  href="/admin"
                  aria-current={pathname.startsWith("/admin") ? "page" : undefined}
                  className={`font-medium transition-colors ${
                    pathname.startsWith("/admin")
                      ? "text-[var(--primary)] border-b-2 border-[var(--primary)]"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  Admin
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] font-medium transition-colors"
                >
                  Logout
                </button>
              </>
            )}
            {!loading && !isAuthenticated && (
              <Link
                href="/login"
                className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] font-medium transition-colors"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
