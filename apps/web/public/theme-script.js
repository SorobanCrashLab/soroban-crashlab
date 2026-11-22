/*
 * Pre-paint bootstrap, served as a static file so it needs no nonce and is
 * allowed by `script-src 'self'` alone (issue #1545, see docs/CSP.md).
 *
 * This runs before React hydrates so the correct theme, motion, text scale and
 * contrast are applied at first paint. It must stay behaviourally identical to
 * the inline script it replaced, and to `generateThemeBootstrapScript()` in
 * src/app/theme-provider-utils.ts — src/app/theme-bootstrap.test.ts asserts the
 * two stay in sync.
 */
try {
  var t = localStorage.getItem('crashlab:theme');
  var d = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', d);
  var a = null;
  try { a = JSON.parse(localStorage.getItem('crashlab:accessibility-prefs:v1') || 'null'); } catch {}
  var motion = a && a.motion;
  var osReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (motion === 'reduced' || ((!motion || motion === 'system') && osReduced)) document.documentElement.setAttribute('data-motion', 'reduced');
  var scale = a && a.textScale;
  var allowed = [100, 112, 125, 150];
  if (allowed.indexOf(scale) === -1) scale = 100;
  document.documentElement.setAttribute('data-text-scale', String(scale));
  document.documentElement.style.fontSize = ((16 * scale) / 100) + 'px';
  if (a && a.contrast === 'high') document.documentElement.classList.add('high-contrast');
} catch {}
/*
 * Gates the CSS transitions in globals.css until the correct theme is applied.
 * Without this the transition animates the initial light->dark swap, producing
 * a visible flash.
 */
document.documentElement.classList.add('theme-ready');
