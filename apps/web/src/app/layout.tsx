import type { Metadata } from "next";
import "./globals.css";
import { fontVariables } from "./fonts";
import { ThemeProvider } from "../components/ThemeProvider";
import { LocaleProvider } from "../i18n/context";
import { ToastProvider } from "../components/Toast";
import NavBar from "../components/NavBar";
import AddKeyboardShortcutCheatsheetModal from "./add-keyboard-shortcut-cheatsheet-modal";
import OnboardingWizardHost from "./OnboardingWizardHost";
import CommandPalette from "../components/CommandPalette";
import PageTransition from "../components/PageTransition";
import { GlobalScrollEffects } from "../components/scroll-effects/GlobalScrollEffects";
export const metadata: Metadata = {
  title: "Soroban CrashLab | Smart Contract Fuzzing Platform",
  description:
    "Intelligent mutation testing and runtime behavior tracing for Soroban smart contracts on the Stellar network.",
  openGraph: {
    title: "Soroban CrashLab",
    description: "Advanced fuzzing framework for Soroban smart contracts",
    type: "website",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Soroban CrashLab",
  },
  formatDetection: {
    telephone: false,
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `\n            try {\n              var t = localStorage.getItem('crashlab:theme');\n              var d = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);\n              document.documentElement.classList.toggle('dark', d);\n            } catch(e) {}\n            document.documentElement.classList.add('theme-ready');\n          ` }} />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon/192x192/favicon.svg" type="image/svg+xml" sizes="192x192" />
        <link rel="apple-touch-icon" href="/favicon/180x180/favicon.svg" />
        <meta name="theme-color" content="#0A66C2" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0c0c0c" media="(prefers-color-scheme: dark)" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CrashLab" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased min-h-screen">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <LocaleProvider>
          <ThemeProvider>
            <ToastProvider>
              <NavBar />
              <AddKeyboardShortcutCheatsheetModal />
              <CommandPalette />
              <OnboardingWizardHost />
              <GlobalScrollEffects>
                <main id="main-content" tabIndex={-1} className="page-shell">
                  <PageTransition>
                    {children}
                  </PageTransition>
                </main>
              </GlobalScrollEffects>
            </ToastProvider>
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
