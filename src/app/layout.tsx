import type { Metadata } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import NavBar from "@/components/NavBar";
import Toaster from "@/components/ui/Toaster";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the per-request CSP nonce the middleware attached. Next auto-applies
  // it to the inline scripts it injects (hydration markers, etc.) when the
  // header is present.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en">
      <head>{nonce ? <meta property="csp-nonce" content={nonce} /> : null}</head>
      <body className={`${geistSans.variable} antialiased`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-[var(--primary)] focus:text-white focus:rounded-lg"
        >
          Skip to main content
        </a>
        <NavBar />
        <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <Toaster />
      </body>
    </html>
  );
}
