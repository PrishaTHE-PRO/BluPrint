import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CursorGrid from './components/CursorGrid';
import blueprintPattern from './assets/architectural-blueprint-generated.png';
import './cursor-grid-background.css';

// Cursor ripple strength. Dark mode gets a softer glow so it doesn't glare.
const RIPPLE = {
  light: { maxOpacity: 0.85, spotlight: 0.6 },
  dark: { maxOpacity: 0.35, spotlight: 0.25 },
};

const isDark = () => document.documentElement.classList.contains('dark-mode');

// Follows the theme toggle, which flips the dark-mode class on <html>.
function useDarkMode() {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function BlueprintBackground() {
  const ripple = useDarkMode() ? RIPPLE.dark : RIPPLE.light;
  return (
    <CursorGrid
      patternUrl={blueprintPattern}
      patternMask="white-on-blue"
      patternFit="cover"
      cellSize={60}
      color="#ffffff"
      gridColor="#ffffff"
      highlight="area"
      gridStyle="lines"
      radius={140}
      holdTime={400}
      fadeDuration={800}
      gridOpacity={0.24}
      maxOpacity={ripple.maxOpacity}
      fillOpacity={0}
      spotlight={ripple.spotlight}
      edgeFade={0.08}
      intro={false}
      clickPulse
    />
  );
}

// A separate React root lets the same background serve the HTML and React pages.
const host = document.createElement('div');
host.id = 'cursor-grid-background';
host.setAttribute('aria-hidden', 'true');
document.body.classList.add('has-cursor-grid');
document.body.appendChild(host);

const root = createRoot(host);
root.render(<BlueprintBackground />);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    root.unmount();
    host.remove();
    document.body.classList.remove('has-cursor-grid');
  });
}
