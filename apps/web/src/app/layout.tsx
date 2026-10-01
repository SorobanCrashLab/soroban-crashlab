import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { NONCE_HEADER } from "../lib/csp";
import { fontVariables } from "./fonts";
import { ThemeProvider } from "../components/ThemeProvider";
import { AccessibilityProvider } from "../components/AccessibilityProvider";
import { LocaleProvider } from "../i18n/context";
import { ToastProvider } from "../components/Toast";
import NavBar from "../components/NavBar";
import AddKeyboardShortcutCheatsheetModal from "../features/misc/add-keyboard-shortcut-cheatsheet-modal";
import OnboardingWizardHost from "./OnboardingWizardHost";
import CommandPalette from "../components/CommandPalette";
import PageTransition from "../components/PageTransition";
import { GlobalScrollEffects } from "../components/scroll-effects/GlobalScrollEffects";
import { UploadthingSsrConfigScript } from "../components/UploadthingSsrConfigScript";
import { extractRouterConfig } from "uploadthing/server";
import { crashlabFileRouter } from "./api/uploadthing/core";
import { SentryClientBootstrap } from "../components/SentryClientBootstrap";

/**
 * Nonce-based CSP (issue #1545, see docs/CSP.md). The proxy mints a
 * per-request nonce and Next.js stamps it onto the scripts it emits — but only
 * for a response rendered per request. A prerendered page is built at compile
 * time with no request headers in scope, so its inline scripts would carry
 * `"nonce":"$undefined"` and the strict `script-src` would block hydration
 * entirely. Forcing dynamic rendering is what makes the nonce meaningful.
 *
 * This opts every page in the app out of static prerendering, which costs TTFB
 * and CDN-cacheability in exchange for a policy that actually blocks injected
 * script. Revisit if the app moves behind full-route caching.
 */
export const dynamic = 'force-dynamic';

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
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The per-request CSP nonce minted by the proxy. Next stamps it onto the
  // scripts it emits, but third-party components that inject their own
  // <script> must be handed it explicitly or the browser blocks them.
  // Reading headers() also keeps this layout on the dynamic render path the
  // nonce requires.
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        {/*
          Pre-paint theme/accessibility bootstrap, served as a static file so it is
          covered by `script-src 'self'` and needs no inline allowance
          (issue #1545, see docs/CSP.md). Kept synchronous and in <head> so it runs
          before first paint — `async`/`defer` would let the wrong theme flash.
          src/app/theme-bootstrap.test.ts asserts this file stays in sync with
          generateThemeBootstrapScript().
        */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- this script
            MUST block parsing: it applies the persisted theme before first
            paint. Deferring or async-ing it would let the wrong theme render
            and then swap, which is the flash-of-wrong-theme this exists to
            prevent. See docs/CSP.md. */}
        <script src="/theme-script.js" />
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
        <UploadthingSsrConfigScript
          routerConfig={extractRouterConfig(crashlabFileRouter)}
          nonce={nonce}
        />
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <LocaleProvider>
          <SentryClientBootstrap />
          <ThemeProvider>
            <AccessibilityProvider>
              <ToastProvider>
              <NavBar />
              <AddKeyboardShortcutCheatsheetModal />
              <CommandPalette />
              <OnboardingWizardHost />
              <GlobalScrollEffects>
                <main id="page-shell" className="pt-[56px] lg:pt-[68px]" style={{ background: 'var(--bg)', minHeight: '100vh', transition: 'background 0.3s ease' }}>
                  <PageTransition>
                    {children}
                  </PageTransition>
                </main>
              </GlobalScrollEffects>
              </ToastProvider>
            </AccessibilityProvider>
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
