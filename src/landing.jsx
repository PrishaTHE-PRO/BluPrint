import { createRoot } from 'react-dom/client';
import BlurText from './components/BlurText';
import { initHero3D } from './landing-hero3d.js';

const LandingHeadline = () => (
  <div className="blur-hero-title" role="heading" aria-level="1">
    <BlurText
      text="Your room,"
      delay={115}
      animateBy="words"
      direction="top"
      stepDuration={0.42}
      threshold={0.2}
      className="blur-title-line"
    />
    <BlurText
      text="thoughtfully planned."
      delay={105}
      animateBy="words"
      direction="bottom"
      stepDuration={0.46}
      threshold={0.2}
      className="blur-title-line blur-title-emphasis"
    />
  </div>
);

const LandingExperience = () => (
  <LandingHeadline />
);

const headlineRoot = document.getElementById('blur-headline-root');

if (headlineRoot) {
  createRoot(headlineRoot).render(<LandingExperience />);
}

// Swaps the hero's static floor-plan SVG for a live, orbitable room. Three.js
// is imported dynamically inside this call, so it never lands in the landing
// page's initial bundle.
initHero3D();
