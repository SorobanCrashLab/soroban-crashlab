import type { Metadata } from "next";
import "./globals.css";
import { fontVariables } from "./fonts";
import { ThemeProvider } from "../components/ThemeProvider";
import { AccessibilityProvider } from "../components/AccessibilityProvider";
import { LocaleProvider } from "../i18n/context";
import { ToastProvider } from "../components/Toast";
import NavBar from "../components/NavBar";
import AddKeyboardShortcutCheatsheetModal from "./add-keyboard-shortcut-cheatsheet-modal";
import OnboardingWizardHost from "./OnboardingWizardHost";
import CommandPalette from "../components/CommandPalette";
import PageTransition from "../components/PageTransition";
import { GlobalScrollEffects } from "../components/scroll-effects/GlobalScrollEffects";
import { NextSSRPlugin } from "@uploadthing/react/next-ssr-plugin";
import { extractRouterConfig } from "uploadthing/server";
import { crashlabFileRouter } from "./api/uploadthing/core";
import { SentryClientBootstrap } from "../components/SentryClientBootstrap";
import { generateThemeBootstrapScript } from "./theme-provider-utils";
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
  maximumScale: 5,
  userScalable: true,
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
          __html: `\n            try {\n              ${generateThemeBootstrapScript()}\n              var a = null;\n              try { a = JSON.parse(localStorage.getItem('crashlab:accessibility-prefs:v1') || 'null'); } catch(e) {}\n              var motion = a && a.motion;\n              var osReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;\n              if (motion === 'reduced' || (!motion || motion === 'system') && osReduced) document.documentElement.setAttribute('data-motion', 'reduced');\n              var scale = a && a.textScale;\n              var allowed = [100,112,125,150];\n              if (allowed.indexOf(scale) === -1) scale = 100;\n              document.documentElement.setAttribute('data-text-scale', String(scale));\n              document.documentElement.style.fontSize = ((16 * scale) / 100) + 'px';\n              if (a && a.contrast === 'high') document.documentElement.classList.add('high-contrast');\n            } catch(e) {}\n            document.documentElement.classList.add('theme-ready');\n          ` }} />
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
        <NextSSRPlugin routerConfig={extractRouterConfig(crashlabFileRouter)} />
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
