"use client";

import "./globals.css";
import { ThemeProvider } from "../components/ThemeProvider";
import NavBar from "../components/NavBar";
import OnboardingWizard from "./components/OnboardingWizard";
import { useOnboardingWizard } from "./hooks/useOnboardingWizard";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { showWizard, markComplete } = useOnboardingWizard();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Soroban CrashLab | Smart Contract Fuzzing</title>
        <meta
          name="description"
          content="Intelligent mutation testing and runtime behavior tracing for Soroban smart contracts."
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
            try {
              var t = localStorage.getItem('crashlab:theme');
              var d = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
              document.documentElement.classList.toggle('dark', d);
            } catch(e) {}
          `,
          }}
        />
      </head>
      <body className="antialiased min-h-screen">
        <ThemeProvider>
          <NavBar />
          <main
            style={{
              background: "var(--bg)",
              paddingTop: "52px",
              minHeight: "100vh",
              transition: "background 0.3s ease",
            }}
          >
            {children}
          </main>
          <OnboardingWizard isOpen={showWizard} onClose={markComplete} />
        </ThemeProvider>
      </body>
    </html>
  );
}
