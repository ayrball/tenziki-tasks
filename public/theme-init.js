// Applies the saved/system theme before first paint (avoids a light flash).
// Kept as a separate file so the Content-Security-Policy doesn't need to allow inline scripts.
(function () {
  try {
    var saved = localStorage.getItem('tenziki_theme');
    var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch {}
})();
