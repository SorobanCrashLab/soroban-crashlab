import localFont from "next/font/local";

/**
 * Self-hosted font definitions.
 *
 * These variable WOFF2 files are committed under `src/app/fonts` and are
 * subset to the Latin/Latin-extended ranges used by the UI. `next/font/local`
 * emits the same `@font-face` machinery and size-adjusted fallback face as
 * `next/font/google`, but removes the build-time dependency on Google Fonts.
 * That matters in air-gapped/offline CI (notably the Docker gate), where
 * Google occasionally returns extensionless font URLs that Next 16 cannot
 * parse (vercel/next.js#99114).
 *
 * `font-display: swap` is applied by the loader default — do not pass it
 * explicitly.
 */

/**
 * UI typeface for labels, buttons, navigation and metadata.
 */
export const inter = localFont({
  src: "./fonts/inter-variable.woff2",
  weight: "100 900",
  variable: "--font-inter",
  preload: true,
  adjustFontFallback: "Arial",
});

/**
 * Body/editorial typeface. Serif for long-form reading and paragraphs.
 */
export const lora = localFont({
  src: "./fonts/lora-variable.woff2",
  weight: "400 700",
  variable: "--font-lora",
  preload: true,
  adjustFontFallback: "Times New Roman",
});

/**
 * Display typeface for headlines — the Newsprint "masthead" voice, kept in
 * the tech-forward Space Grotesk instead of a serif. Used at heavy weights
 * for hero text and section headings.
 */
export const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-variable.woff2",
  weight: "300 700",
  variable: "--font-space-grotesk",
  preload: true,
  adjustFontFallback: "Arial",
});

/** Monospace typeface for run IDs, status text, stats and logs. */
export const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-variable.woff2",
  weight: "100 800",
  variable: "--font-jetbrains-mono",
  preload: true,
  adjustFontFallback: false,
});

/** Convenience: all font CSS variables, applied once on `<html>`. */
export const fontVariables = `${inter.variable} ${lora.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`;
