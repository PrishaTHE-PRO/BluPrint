import { createRoot } from 'react-dom/client';
import CursorGrid from './components/CursorGrid';
import blueprintPattern from './assets/architectural-blueprint-generated.png';
import './cursor-grid-background.css';

// A separate React root lets the same background serve the HTML and React pages.
const host = document.createElement('div');
host.id = 'cursor-grid-background';
host.setAttribute('aria-hidden', 'true');
document.body.classList.add('has-cursor-grid');
document.body.appendChild(host);

const root = createRoot(host);
root.render(
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
    gridOpacity={0.18}
    maxOpacity={0.85}
    fillOpacity={0}
    spotlight={0.6}
    edgeFade={0.08}
    intro={false}
    clickPulse
  />,
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    root.unmount();
    host.remove();
    document.body.classList.remove('has-cursor-grid');
  });
}
