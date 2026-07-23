/**
 * Shared dark/light theme helpers for BluPrint.
 * Animated React switches mount via /src/theme-switch.tsx into [data-theme-switch].
 * This script still applies the saved theme on load and exposes window.blueprintTheme.
 */
(function initBlueprintThemeToggle() {
  function applyTheme(isDark) {
    document.documentElement.classList.toggle('dark-mode', isDark);
    document.body.classList.toggle('dark-mode', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    try {
      localStorage.setItem('blueprintTheme', isDark ? 'dark' : 'light');
    } catch (_) { /* ignore */ }

    // Legacy icon buttons (if any remain)
    document.querySelectorAll('#theme-toggle-btn iconify-icon, [data-theme-toggle] iconify-icon').forEach((icon) => {
      icon.setAttribute('icon', isDark ? 'ph:sun-duotone' : 'ph:moon-duotone');
    });
  }

  function currentIsDark() {
    try {
      if (localStorage.getItem('blueprintTheme') === 'dark') return true;
      if (localStorage.getItem('blueprintTheme') === 'light') return false;
    } catch (_) { /* ignore */ }
    return document.documentElement.classList.contains('dark-mode');
  }

  function wireButton(btn) {
    if (!btn || btn.dataset.themeWired === '1') return;
    // React SwitchMode owns clicks on [data-theme-switch].
    if (btn.hasAttribute('data-theme-switch') || btn.closest('[data-theme-switch]')) return;
    btn.dataset.themeWired = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      applyTheme(!document.documentElement.classList.contains('dark-mode'));
    });
  }

  function wireAll() {
    document.querySelectorAll('#theme-toggle-btn, [data-theme-toggle]').forEach(wireButton);
    applyTheme(currentIsDark());
  }

  function boot() {
    wireAll();
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      document.querySelectorAll('#theme-toggle-btn, [data-theme-toggle]').forEach(wireButton);
      const dark = currentIsDark();
      document.querySelectorAll('#theme-toggle-btn iconify-icon, [data-theme-toggle] iconify-icon').forEach((icon) => {
        const want = dark ? 'ph:sun-duotone' : 'ph:moon-duotone';
        if (icon.getAttribute('icon') !== want) icon.setAttribute('icon', want);
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.blueprintTheme = { applyTheme, currentIsDark, wireAll };
})();
