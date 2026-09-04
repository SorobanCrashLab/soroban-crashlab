import { JetBrains_Mono, Source_Sans_3 } from "next/font/google";

/**
 * Self-hosted font definitions.
 *
 * `next/font` downloads and subsets these at build time and serves the
 * woff2 files from our own origin, so the browser never talks to
 * fonts.googleapis.com or fonts.gstatic.com at runtime. Font metrics are
 * inlined with an automatic size-adjusted fallback face, which keeps layout
 * shift (CLS) at or below the previous stylesheet-link setup.
 *
 * `font-display: swap` is applied by `next/font` by default — do not pass it
 * explicitly.
 */

/** Body/UI typeface. Weights mirror the four previously requested from Google. */
export const sourceSans = Source_Sans_3({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-source-sans",
  preload: true,
});

/** Monospace typeface for run IDs, logs and code. Three weights, as before. */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  preload: true,
});

/** Convenience: both font CSS variables, applied once on `<html>`. */
export const fontVariables = `${sourceSans.variable} ${jetbrainsMono.variable}`;
