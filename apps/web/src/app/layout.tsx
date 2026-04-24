import Link from "next/link";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NotificationCenter from "./add-notification-center-ui";
import DarkModeToggle from "./add-dark-mode-support";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Soroban CrashLab | Smart Contract Fuzzing",
  description:
    "Intelligent mutation testing and runtime behavior tracing for Soroban smart contracts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        <header
          className="border-b p-6 flex items-center justify-between"
          style={{
            borderColor: "var(--header-border-color)",
            background: "var(--background)",
            color: "var(--foreground)",
          }}
        >
          <div className="font-semibold text-xl tracking-tight">
            Soroban CrashLab
          </div>
          <div className="flex items-center gap-4">
            <nav className="flex gap-4 text-sm font-medium">
              <Link
                href="/logs"
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Logs
              </Link>
              <Link
                href="/triage"
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Triage
              </Link>
              <a
                href="/add-accessible-keyboard-nav-blueprint-page-49"
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Keyboard Nav
              </a>
              <a
                href="/implement-alerting-settings-page-54"
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Alerts
              </a>
              <Link
                href="/#reporting-templates"
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Templates
              </Link>
              <a
                href="https://github.com/SorobanCrashLab/soroban-crashlab"
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
              <a
                href="https://github.com/SorobanCrashLab/soroban-crashlab/issues"
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Issues
              </a>
            </nav>
            <NotificationCenter />
            <DarkModeToggle />
          </div>
        </header>
        <main className="flex-1 flex flex-col">{children}</main>
        <footer className="border-t border-black/[.08] dark:border-white/[.145] p-6 text-center text-sm text-zinc-500">
          Built for Stellar Wave 3 &middot; Soroban Ecosystem
        </footer>
      </body>
    </html>
  );
}
