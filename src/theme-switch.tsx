import { createRoot } from 'react-dom/client';
import SwitchMode from './components/SwitchMode';

declare global {
  interface Window {
    blueprintTheme?: {
      applyTheme: (isDark: boolean) => void;
      currentIsDark: () => boolean;
      wireAll: () => void;
    };
  }
}

function mountThemeSwitches() {
  document.querySelectorAll<HTMLElement>('[data-theme-switch]').forEach((el) => {
    if (el.dataset.themeMounted === '1') return;
    el.dataset.themeMounted = '1';

    const width = Number(el.dataset.width) || (el.classList.contains('login-theme-btn') ? 72 : 56);
    const height = Number(el.dataset.height) || (el.classList.contains('login-theme-btn') ? 36 : 28);

    createRoot(el).render(
      <SwitchMode
        width={width}
        height={height}
        className={el.dataset.switchClass || ''}
      />,
    );
  });
}

function boot() {
  mountThemeSwitches();
  if (typeof MutationObserver === 'undefined') return;
  const observer = new MutationObserver(() => mountThemeSwitches());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
