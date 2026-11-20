# WCAG 2.2 AA accessibility program (#2259)

CrashLab targets WCAG 2.2 AA for every operator-facing surface: the run detail
workspace, campaign console, timeline scrubber and the mobile/PWA shell.

## Conformance requirements

| Criterion | Implementation | Verification |
| --- | --- | --- |
| 2.1.1 Keyboard | All interactive widgets are native controls; composite widgets use `AccessibleTabs` with arrow/Home/End support. | `e2e/a11y/keyboard-triage.spec.ts` |
| 2.1.2 No keyboard trap | `useFocusTrap` only traps inside dialogs and restores focus on close. | keyboard e2e |
| 2.4.3 Focus order | `normalizeTabOrder` keeps one tab stop per composite; DOM order matches visual order. | `lib/a11y/wcag22.test.ts` |
| 2.4.11 Focus not obscured | Sticky headers reserve safe-area insets; focused controls scroll into view. | manual + e2e |
| 2.5.8 Target size | Controls use `min-h-11 min-w-11` (44px) or 24px with spacing; `meetsTargetSize` covers exceptions. | `lib/a11y/wcag22.test.ts` |
| 1.4.3 Contrast | `lib/a11y/contrast.ts` tokens are asserted at ≥ 4.5:1; high-contrast preference is honored. | `contrast.test.ts` |
| 2.3.3 Motion | `useReducedMotion` gates scroll effects and transitions. | unit + manual |
| 4.1.3 Status messages | `ScreenReaderAnnouncer` dedupes and re-announces identical messages; live regions are polite/assertive. | `announcer.test.ts` |

## Authoring checklist

1. Use semantic elements (`button`, `a href`, `label`) before adding ARIA.
2. Every input has a programmatically associated label; errors are announced.
3. Every status update goes through `useAnnouncer()`.
4. Never rely on color alone — pair status with text and a glyph.
5. Test with keyboard only, then with VoiceOver/NVDA at 200% text scale.

 CI blocks critical/serious axe violations and regressions in keyboard
 navigation via `e2e/a11y` in `.github/workflows/e2e.yml`.
