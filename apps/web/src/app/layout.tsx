import Link from "next/link";
import type { Metadata } from "next";
import "./globals.css";
import NotificationCenter from "./add-notification-center-ui";
import DarkModeToggle from "./add-dark-mode-support";
import MobileNavDrawer from "./MobileNavDrawer";

// Using system fonts to avoid external Google Fonts fetch during build

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k="crashlab:dark-mode",s=localStorage.getItem(k),d=s!==null?s==="true":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d){document.documentElement.classList.add("dark");document.documentElement.style.setProperty("--background","#0a0a0a");document.documentElement.style.setProperty("--foreground","#ededed");document.documentElement.style.setProperty("--header-border-color","rgba(255,255,255,0.145)")}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`antialiased min-h-screen flex flex-col`}
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
          <MobileNavDrawer />
          <div className="hidden md:flex items-center gap-4">
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
              <Link
                href="/settings/accessibility"
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Keyboard Nav
              </Link>
              <Link
                href="/settings/alerting"
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Alerts
              </Link>
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
        <footer className="border-t border-black/8 dark:border-white/15 p-6 text-center text-sm text-zinc-500">
          Built for Stellar &middot; Soroban Ecosystem
        </footer>
      </body>
    </html>
  );
}
