import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Iowa Grant Scanner - Find Small Business Grants in Iowa",
  description:
    "Discover and browse small business grants available in Iowa. Filter by eligibility, location, industry, and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} antialiased`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-[var(--primary)] focus:text-white focus:rounded-lg"
        >
          Skip to main content
        </a>
        <nav className="bg-white border-b border-[var(--border)] sticky top-0 z-50" aria-label="Main navigation">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Link href="/" className="flex items-center gap-2">
                <span className="text-2xl font-bold text-[var(--primary)]">
                  Iowa Grant Scanner
                </span>
              </Link>
              <div className="flex gap-6">
                <Link
                  href="/"
                  className="text-[var(--muted)] hover:text-[var(--foreground)] font-medium transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  href="/calendar"
                  className="text-[var(--muted)] hover:text-[var(--foreground)] font-medium transition-colors"
                >
                  Deadlines
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
