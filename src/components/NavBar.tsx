"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAdmin } from "@/lib/hooks/useAdmin";
import Drawer from "@/components/ui/Drawer";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/calendar", label: "Deadlines" },
  { href: "/export", label: "Export" },
];

function isLinkActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

interface NavLinksProps {
  pathname: string;
  isAuthenticated: boolean;
  loading: boolean;
  onNavigate?: () => void;
  onLogout: () => void;
  variant: "desktop" | "mobile";
}

function NavLinks({
  pathname,
  isAuthenticated,
  loading,
  onNavigate,
  onLogout,
  variant,
}: Readonly<NavLinksProps>) {
  const baseLinkClass =
    variant === "desktop"
      ? "font-medium transition-colors"
      : "block w-full py-3 text-base font-medium transition-colors";

  const activeCls =
    variant === "desktop"
      ? "text-[var(--primary)] border-b-2 border-[var(--primary)]"
      : "text-[var(--primary)]";
  const inactiveCls = "text-[var(--muted)] hover:text-[var(--foreground)]";

  const containerCls =
    variant === "desktop"
      ? "flex gap-6 items-center"
      : "flex flex-col items-stretch divide-y divide-[var(--border)]";

  return (
    <div className={containerCls}>
      {NAV_LINKS.map(({ href, label }) => {
        const isActive = isLinkActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={`${baseLinkClass} ${isActive ? activeCls : inactiveCls}`}
          >
            {label}
          </Link>
        );
      })}
      {!loading && isAuthenticated && (
        <>
          <Link
            href="/admin"
            onClick={onNavigate}
            aria-current={pathname.startsWith("/admin") ? "page" : undefined}
            className={`${baseLinkClass} ${
              pathname.startsWith("/admin") ? activeCls : inactiveCls
            }`}
          >
            Admin
          </Link>
          <button
            type="button"
            onClick={() => {
              onLogout();
              onNavigate?.();
            }}
            className={`${baseLinkClass} ${inactiveCls} text-left`}
          >
            Logout
          </button>
        </>
      )}
      {!loading && !isAuthenticated && (
        <Link href="/login" onClick={onNavigate} className={`${baseLinkClass} ${inactiveCls}`}>
          Login
        </Link>
      )}
    </div>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, loading, clearAdmin } = useAdmin();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Each nav item calls `onNavigate` (passed below) to close the drawer on
  // tap. For browser back/forward the drawer stays open until dismissed.

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    clearAdmin();
    router.push("/");
    router.refresh();
  };

  return (
    <nav
      className="bg-[var(--card)] border-b border-[var(--border)] sticky top-0 z-50"
      aria-label="Main navigation"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl sm:text-2xl font-bold text-[var(--primary)]">
              Iowa Grant Scanner
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex">
            <NavLinks
              pathname={pathname}
              isAuthenticated={isAuthenticated}
              loading={loading}
              onLogout={handleLogout}
              variant="desktop"
            />
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            className="md:hidden p-2 rounded-lg text-[var(--foreground)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>
      </div>

      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        side="right"
        ariaLabel="Main navigation"
        title="Menu"
      >
        <div id="mobile-nav">
          <NavLinks
            pathname={pathname}
            isAuthenticated={isAuthenticated}
            loading={loading}
            onNavigate={() => setMobileOpen(false)}
            onLogout={handleLogout}
            variant="mobile"
          />
        </div>
      </Drawer>
    </nav>
  );
}
