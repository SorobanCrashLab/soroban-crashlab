# Theming

The app's color theme and accessibility contrast preference are separate
settings:

- `ThemeProvider` persists `light` or `dark` in `crashlab:theme`. With no
  override, it follows `prefers-color-scheme`.
- `AccessibilityProvider` persists standard or high contrast in the
  accessibility preferences store. High contrast can be combined with either
  light or dark.

The synchronous [`theme-script.js`](../../apps/web/public/theme-script.js)
sets the theme class and `data-theme` before first paint. The React provider
keeps those attributes synchronized after hydration and across system or
storage changes. The test in `src/app/theme-bootstrap.test.ts` protects the
pre-paint and runtime contract.

Theme values belong in
[`tokens/themes/light.css`](../../apps/web/src/styles/tokens/themes/light.css),
[`dark.css`](../../apps/web/src/styles/tokens/themes/dark.css), or
[`high-contrast.css`](../../apps/web/src/styles/tokens/themes/high-contrast.css).
Use semantic variables from `semantic.css` rather than adding selectors with
component-specific color overrides.

To add a theme value, define its semantic token and provide a value for every
theme, including both contrast modes where applicable. Keep focus indicators
visible in every theme, and verify text and UI-state contrast with the token
tests before adopting a new color.
