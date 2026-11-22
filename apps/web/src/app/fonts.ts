import { Inter, JetBrains_Mono, Lora, Space_Grotesk } from "next/font/google";

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

/**
 * UI typeface for labels, buttons, navigation and metadata.
 */
export const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  preload: true,
});

/**
 * Body/editorial typeface. Serif for long-form reading and paragraphs.
 */
export const lora = Lora({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600"],
  variable: "--font-lora",
  preload: true,
});

/**
 * Display typeface for headlines — the Newsprint "masthead" voice, kept in
 * the tech-forward Space Grotesk instead of a serif. Used at heavy weights
 * for hero text and section headings.
 */
export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  preload: true,
});

/** Monospace typeface for run IDs, status text, stats and logs. */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
  preload: true,
});

/** Convenience: all font CSS variables, applied once on `<html>`. */
export const fontVariables = `${inter.variable} ${lora.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`;
