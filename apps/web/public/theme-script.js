try {
  var t = localStorage.getItem('crashlab:theme');
  var d = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', d);
} catch {}
