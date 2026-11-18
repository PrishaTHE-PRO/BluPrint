// landing-hero3d.js — turns the hero's static floor-plan mockup into a live,
// orbitable 3D room with a style switcher, drawn first as the site's 3D sketch.
//
// Three.js is ~600KB, which has no business blocking a landing page's first
// paint, so the viewer is dynamically imported and only once:
//   - the hero is actually on screen (IntersectionObserver), and
//   - the browser is idle.
// Until then — and permanently, if WebGL is missing or the visitor prefers
// reduced motion — the room shows as the hand-drawn 3D sketch instead. The 3D is an
// upgrade layered on top, never a requirement.

import rough from 'roughjs';
import { renderIsoRoom } from '../iso-preview.js';

// `name` is what the "Style matched" bubble shows; `spend` is the demo
// room's total for the "On budget" bubble, against a $5,000 budget.
const STYLES = [
  { key: 'modern', label: 'Modern', name: 'Warm modern', spend: 4920 },
  { key: 'scandinavian', label: 'Scandi', name: 'Soft scandi', spend: 4180 },
  { key: 'bohemian', label: 'Boho', name: 'Earthy boho', spend: 3880 },
  { key: 'industrial', label: 'Industrial', name: 'Raw industrial', spend: 4460 },
  { key: 'minimalist', label: 'Minimal', name: 'Clean minimal', spend: 3550 },
];
const DEMO_BUDGET = 5000;

/** Keeps the two bubbles over the card in step with the chosen style. */
function syncNotes(styleKey) {
  const style = STYLES.find((s) => s.key === styleKey);
  if (!style) return;
  const name = document.querySelector('[data-hero-style-name]');
  const spend = document.querySelector('[data-hero-budget]');
  const bar = document.querySelector('[data-hero-budget-bar]');
  if (name) name.textContent = style.name;
  if (spend) spend.textContent = '$' + style.spend.toLocaleString();
  if (bar) bar.style.width = Math.round((style.spend / DEMO_BUDGET) * 100) + '%';
}

// A small, believable living room. x/y are FEET from the room's top-left, the
// same convention as PlacementPos in the app, so this goes through the exact
// code path the product uses rather than a bespoke demo scene.
const DEMO_ROOM = {
  widthFt: 15,
  lengthFt: 13,
  heightFt: 9,
  scale: 20,
  furnitureLayout: [
    { category: 'rug',           x: 3.4,  y: 4.0,  rot: 0,   wIn: 96, dIn: 72 },
    { category: 'sofa',          x: 3.0,  y: 9.0,  rot: 180, wIn: 84, dIn: 36 },
    { category: 'coffee_table',  x: 5.6,  y: 6.2,  rot: 0,   wIn: 44, dIn: 24 },
    { category: 'accent_chair',  x: 10.6, y: 5.2,  rot: 250, wIn: 32, dIn: 32 },
    { category: 'side_table',    x: 1.0,  y: 8.6,  rot: 0,   wIn: 18, dIn: 18 },
    { category: 'floor_lamp',    x: 12.4, y: 1.4,  rot: 0,   wIn: 14, dIn: 14 },
    { category: 'bookcase',      x: 1.0,  y: 0.5,  rot: 0,   wIn: 36, dIn: 13 },
    { category: 'indoor_plants', x: 13.0, y: 10.6, rot: 0,   wIn: 20, dIn: 20 },
  ],
};

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && canvas.getContext('webgl2'));
  } catch { return false; }
}

function whenIdle(fn) {
  if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout: 2500 });
  else window.setTimeout(fn, 700);
}

// The same demo room drawn as the site's hand-drawn 3D sketch (the one on the
// dashboard and project cards). It replaces the old flat plan as what shows
// before the live 3D loads, and for good on reduced motion or no WebGL.
function mountSketch(plan) {
  if (!plan) return plan;
  try {
    window.rough = window.rough || rough;
    const markup = renderIsoRoom({
      _id: 'landing-hero',
      name: 'Living room',
      widthFt: DEMO_ROOM.widthFt,
      lengthFt: DEMO_ROOM.lengthFt,
      heightFt: DEMO_ROOM.heightFt,
      sqft: DEMO_ROOM.widthFt * DEMO_ROOM.lengthFt,
      furnitureLayout: {
        items: DEMO_ROOM.furnitureLayout.map((f) => ({
          category: f.category, x: f.x, y: f.y, rotation: f.rot,
          item: { widthIn: f.wIn, depthIn: f.dIn },
        })),
      },
    }, { floorLabel: `${DEMO_ROOM.widthFt} ft × ${DEMO_ROOM.lengthFt} ft` });
    const tpl = document.createElement('template');
    tpl.innerHTML = (markup || '').trim();
    const sketch = tpl.content.firstElementChild;
    if (!sketch) return plan;
    sketch.setAttribute('class', 'floor-plan floor-plan--sketch');
    sketch.setAttribute('aria-hidden', 'true');
    sketch.removeAttribute('role');
    plan.replaceWith(sketch);
    return sketch;
  } catch (error) {
    console.warn('[hero3d] sketch unavailable, keeping the flat plan', error);
    return plan;
  }
}

export function initHero3D() {
  const stage = document.querySelector('[data-hero-3d]');
  const plan = mountSketch(document.querySelector('.floor-plan'));
  const chipRow = document.querySelector('[data-hero-styles]');
  if (!stage) return;

  // Reduced motion or no WebGL: leave the SVG plan alone and drop the style
  // chips, so there is no live-looking UI pointing at a viewer that will never
  // load.
  if (prefersReducedMotion() || !hasWebGL()) {
    chipRow?.remove();
    return;
  }

  let mod = null;          // the room3d module, imported once
  let viewer = null;
  let onScreen = true;
  let userTookOver = false; // once they drag, stop spinning the room under them
  let started = false;
  let currentStyle = 'modern';

  // The viewer renders on demand. Auto-rotate is the one thing that needs
  // frames nobody asked for, so it is gated on the hero being visible AND the
  // tab being foreground — an idle spin behind another tab is pure battery
  // burn, and this page is the first thing anyone loads.
  function syncSpin() {
    if (!viewer?.controls) return;
    const shouldSpin = onScreen && !document.hidden && !userTookOver;
    viewer.controls.autoRotate = shouldSpin;
    if (shouldSpin) viewer.requestFrame();
  }

  // The scene clears to a solid colour, so it has to follow the page theme —
  // a cream room floating in a dark page reads as a bug. Matches the
  // html.dark-mode .canvas background in index.html.
  const sceneBackground = () =>
    document.documentElement.classList.contains('dark-mode') ? 0x131b24 : 0xf7f9fb;

  function mount(style) {
    currentStyle = style;
    viewer?.dispose?.();
    viewer = mod.createRoomViewer(stage, { style, background: sceneBackground() });
    viewer.controls.autoRotateSpeed = 0.55;
    viewer.controls.enableZoom = false;   // the hero must never eat page scroll
    viewer.controls.addEventListener('start', () => {
      userTookOver = true;
      syncSpin();
      stage.classList.add('has-interacted');
    });
    viewer.render(DEMO_ROOM);
    syncSpin();
  }

  const start = () => {
    if (started) return;
    started = true;
    whenIdle(async () => {
      try {
        mod = await import('../room3d/room3d.js');
        mount('modern');
      } catch (error) {
        console.warn('[hero3d] viewer unavailable, keeping the 2D plan', error);
        chipRow?.remove();
        return;
      }

      // Cross-fade only once there is something real behind the plan.
      stage.classList.add('is-live');
      plan?.classList.add('is-faded');
      stage.closest('.app-window')?.classList.add('is-live');

      chipRow?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-style]');
        if (!button || button.classList.contains('is-active')) return;
        for (const el of chipRow.querySelectorAll('[data-style]')) {
          const active = el === button;
          el.classList.toggle('is-active', active);
          el.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
        syncNotes(button.dataset.style);
        // The palette is baked in at construction, so swap the whole viewer
        // rather than trying to repaint every material in place.
        mount(button.dataset.style);
      });

      // Re-mount on a theme toggle so the scene background tracks the page.
      // Toggling is rare enough that rebuilding the scene is cheaper than
      // wiring a live background setter through the viewer.
      new MutationObserver(() => {
        const wanted = sceneBackground();
        if (viewer?.scene?.background?.getHex() !== wanted) mount(currentStyle);
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    });
  };

  document.addEventListener('visibilitychange', syncSpin);

  if ('IntersectionObserver' in window) {
    // Kept connected after the first hit: the same signal that kicks off the
    // load also parks the spin when the hero scrolls away.
    const io = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
      if (onScreen) start();
      syncSpin();
    }, { rootMargin: '120px' });
    io.observe(stage);
  } else {
    start();
  }
}

export { STYLES };
