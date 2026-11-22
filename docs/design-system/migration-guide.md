# Design system migration guide

Use this checklist when changing an existing screen:

1. Replace raw colors with the appropriate semantic `--ds-color-*` token.
   Keep status foreground/background pairs together.
2. Replace arbitrary spacing, typography, radius, shadow, and z-index values
   with the shared `--space-*`, `--primitive-font-size-*`, `--radius-*`,
   `--shadow-*`, and `--z-index-*` scales.
3. Use shared `Button`, `TextField`, `Select`, `Badge`, `Card`, and `Dialog`
   components. Preserve the existing label, validation, focus, and disabled
   behavior when converting a form control.
4. Use motion tokens and test with both system reduced motion and the
   accessibility setting set to reduced.
5. Check the same screen in light, dark, and high-contrast themes. Confirm
   keyboard focus, error messaging, and status meaning remain apparent without
   color alone.

Prefer a focused, manual migration over bulk replacement: the same literal
color can represent different intent in different contexts. There is no
codemod because a text-only rewrite cannot determine semantic intent safely.

Run the relevant component tests and `pnpm --dir apps/web run lint` after
migrating a screen. Visual changes should be checked in the existing visual
test suite when the affected flow has a visual test.

The repository does not currently have a Storybook configuration. The token
and usage documentation here is the stable reference for the Storybook work
tracked separately; avoid adding a second documentation source in component
comments.
