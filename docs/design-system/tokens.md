# Design tokens

The web app's token source lives in
[`apps/web/src/styles/tokens/`](../../apps/web/src/styles/tokens/). Keep raw
palette and scale values in `primitives.css`; expose meaning through the
`--ds-*` variables in `semantic.css`; and change semantic values per theme in
`themes/`. `typography.css` and `motion.css` provide type and motion scales.

## Token layers

- **Primitive tokens** are raw values such as `--primitive-space-4`,
  `--primitive-radius-md`, and `--primitive-color-neutral-900`. Use these when
  defining semantic tokens, not for one-off component styling.
- **Semantic tokens** describe intent: `--ds-color-background`,
  `--ds-color-text-primary`, `--ds-color-success-text`,
  `--motion-duration-normal`, and `--z-index-modal`.
- **Compatibility aliases** (`--bg`, `--surface`, `--text-primary`, and
  related names) keep existing screens stable while they migrate. New
  components should use semantic tokens directly.

Tailwind CSS v4 utilities are mapped in the `@theme inline` block in
`semantic.css` and `typography.css`; values remain CSS variables so they
resolve at runtime when the theme changes.

## Semantic colors

Use the paired foreground and background for status content:

| Intent | Foreground | Background |
|---|---|---|
| Success | `--ds-color-success-text` | `--ds-color-success-bg` |
| Warning | `--ds-color-warning-text` | `--ds-color-warning-bg` |
| Error | `--ds-color-error-text` | `--ds-color-error-bg` |
| Information | `--ds-color-info-text` | `--ds-color-info-bg` |
| Neutral | `--ds-color-neutral-text` | `--ds-color-neutral-bg` |

These pairs are checked against WCAG AA text contrast in
`src/styles/design-tokens.test.ts`. Do not rely on color alone to communicate
status; include visible text or another non-color indicator.

## Core component examples

```tsx
<Button variant="primary">Save</Button>
<TextField label="Project name" name="projectName" />
<Badge variant="success">Healthy</Badge>
<Card>
  <CardHeader>
    <CardTitle>Recent runs</CardTitle>
    <CardDescription>Latest campaign activity</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>
```

The shared components are exported from `src/components/index.ts`. Prefer
them over new local button, field, badge, card, or dialog styling. For table
states, use `ds-table-row` (including `aria-selected="true"` for selection)
and `ds-table-state` for empty/loading messaging.
