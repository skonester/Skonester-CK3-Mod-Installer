{
  const key = 'ck3-installer-theme';
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  let preference;
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch {
    // The browser preview can run with storage disabled.
  }

  function applyTheme() {
    const theme = preference ?? (systemTheme.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.getElementById('themeToggle')?.setAttribute('aria-pressed', String(theme === 'dark'));
  }

  applyTheme();
  systemTheme.addEventListener('change', applyTheme);
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    document.getElementById('themeToggle').addEventListener('click', () => {
      preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme();
      try {
        localStorage.setItem(key, preference);
      } catch {
        // Keep the selected mode for this session.
      }
    });
  }, { once: true });
}
