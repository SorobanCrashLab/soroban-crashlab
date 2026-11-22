# Motion

Shared animation durations and easing functions are defined in
[`tokens/motion.css`](../../apps/web/src/styles/tokens/motion.css). Use the
`--motion-duration-*` and `--motion-easing-*` tokens instead of choosing
component-specific timing values.

The `.motion-fade`, `.motion-transform`, and `.motion-color` utilities provide
common transitions. Existing animation-heavy components should continue to
honor both the operating-system preference (`prefers-reduced-motion`) and the
user override (`html[data-motion="reduced"]`). The global reduced-motion
rules disable motion as a fallback for existing styles that have not yet
migrated.

Do not use motion to communicate information that is otherwise unavailable.
For reduced-motion users, preserve the resulting state and use a static
indicator where an animation previously conveyed progress or status.
