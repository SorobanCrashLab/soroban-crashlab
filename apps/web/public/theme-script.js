try {
  var t = localStorage.getItem('crashlab:theme');
  var d = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', d);
  var a = null;
  try { a = JSON.parse(localStorage.getItem('crashlab:accessibility-prefs:v1') || 'null'); } catch (e) {}
  var motion = a && a.motion;
  var osReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (motion === 'reduced' || ((!motion || motion === 'system') && osReduced)) document.documentElement.setAttribute('data-motion', 'reduced');
  var scale = a && a.textScale;
  if ([100, 112, 125, 150].indexOf(scale) === -1) scale = 100;
  document.documentElement.setAttribute('data-text-scale', String(scale));
  document.documentElement.style.fontSize = ((16 * scale) / 100) + 'px';
  if (a && a.contrast === 'high') document.documentElement.classList.add('high-contrast');
} catch (e) {}
