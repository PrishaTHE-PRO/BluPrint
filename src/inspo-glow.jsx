import { createRoot } from 'react-dom/client';
import BorderGlow from './components/BorderGlow';

const glowRoot = document.getElementById('how-it-works-glow');

if (glowRoot) {
  createRoot(glowRoot).render(
    <BorderGlow
      className="how-it-border-glow"
      edgeSensitivity={24}
      glowColor="210 62 72"
      backgroundColor="transparent"
      borderRadius={22}
      glowRadius={34}
      glowIntensity={0.85}
      coneSpread={24}
      animated
      fillOpacity={0}
      colors={['#8fc5e7', '#8fc5e7', '#8fc5e7']}
    />,
  );
}
