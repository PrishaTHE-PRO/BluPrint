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

/** Keeps the two bubbles and the side list in step with the chosen style.
 *  The amount counts up or down to the new total over 600 ms, easing out,
 *  the same way the estimate does on the results sheet. */
let shownSpend = STYLES[0].spend;
let spendFrame = 0;
function syncNotes(styleKey) {
  const style = STYLES.find((s) => s.key === styleKey);
  if (!style) return;
  const name = document.querySelector('[data-hero-style-name]');
  if (name) name.textContent = style.name;
  const amounts = document.querySelectorAll('[data-hero-budget], [data-hero-budget-side]');
  const from = shownSpend;
  const to = style.spend;
  const startedAt = performance.now();
  cancelAnimationFrame(spendFrame);
  const step = (now) => {
    // A frame's timestamp can sit a hair before performance.now() did, so
    // clamp both ends or the first frame overshoots the wrong way.
    const k = Math.max(0, Math.min(1, (now - startedAt) / 600));
    const eased = 1 - Math.pow(1 - k, 3);
    shownSpend = Math.round(from + (to - from) * eased);
    for (const el of amounts) el.textContent = '$' + shownSpend.toLocaleString();
    if (k < 1) spendFrame = requestAnimationFrame(step);
  };
  spendFrame = requestAnimationFrame(step);
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

// Each style chip shows its own furnished room, not just a recolour. Same
// 15 × 13 ft shell (so the camera framing doesn't jump), different pieces and
// arrangement. Modern is the demo room above. Every category is one the app
// already knows, so each piece draws through the real catalog and builders.
// `color` tints a piece the way a product colour does in the app.
const piece = (category, x, y, rot, wIn, dIn, color) => ({ category, x, y, rot, wIn, dIn, ...(color ? { color } : {}) });
const STYLE_ROOMS = {
  modern: DEMO_ROOM,
  // Light, airy, natural wood; plenty of open floor and green.
  scandinavian: {
    ...DEMO_ROOM,
    furnitureLayout: [
      piece('rug',              3.6, 4.6, 0,   96, 72, '#e9e1d3'),
      piece('sofa',             3.4, 9.5, 180, 78, 34, '#d7d3cb'),
      piece('coffee_table',     5.6, 6.2, 0,   40, 22, '#d8b892'),
      piece('accent_chair',    10.6, 5.6, 250, 30, 32, '#c9d6d9'),
      piece('side_table',       1.3, 9.6, 0,   18, 18, '#d8b892'),
      piece('floating_shelves', 5.8, 0.2, 0,   48,  8, '#d8b892'),
      piece('floor_lamp',      12.8, 1.2, 0,   14, 14),
      piece('indoor_plants',    0.7, 0.7, 0,   24, 24),
      piece('indoor_plants',   13.0, 10.6, 0,  22, 22),
    ],
  },
  // Warm and layered: terracotta rug, a reading chair, low shelving, plants
  // in every corner and art on the wall.
  bohemian: {
    ...DEMO_ROOM,
    furnitureLayout: [
      piece('rug',              2.6, 3.6, 0,  112, 84, '#b5653c'),
      piece('sofa',             3.0, 9.2, 180, 84, 36, '#c08457'),
      piece('coffee_table',     5.4, 5.9, 0,   42, 24, '#8b5a33'),
      piece('reading_nook',    10.4, 4.6, 245, 34, 34, '#9c6b46'),
      piece('kitchen_shelf',    0.6, 0.4, 0,   40, 12, '#a9713f'),
      piece('wall_art',         6.4, 0.1, 0,   36,  2),
      piece('floor_lamp',       9.0, 0.6, 0,   14, 14),
      piece('indoor_plants',    0.6, 9.4, 0,   22, 22),
      piece('indoor_plants',   13.1, 0.7, 0,   24, 24),
      piece('indoor_plants',   13.1, 10.7, 0,  20, 20),
    ],
  },
  // Darker and harder-edged: a cognac leather sofa, metal shelving, a tall
  // cabinet and a pendant over the table.
  industrial: {
    ...DEMO_ROOM,
    furnitureLayout: [
      piece('rug',              3.4, 4.4, 0,   96, 60, '#6e6e73'),
      piece('sofa',             3.0, 9.0, 180, 84, 36, '#7a4b33'),
      piece('coffee_table',     5.6, 6.0, 0,   44, 24, '#3a3a3f'),
      piece('accent_chair',    10.6, 5.2, 250, 32, 32, '#7a4b33'),
      piece('bookcase',         0.8, 0.5, 0,   36, 13, '#3a3a3f'),
      piece('storage_cabinet', 11.2, 0.5, 0,   36, 18, '#4f3826'),
      piece('pendant_light',    6.3, 6.2, 0,   14, 14),
      piece('floor_lamp',       0.6, 9.4, 0,   14, 14),
    ],
  },
  // Only the essentials, with lots of empty floor.
  minimalist: {
    ...DEMO_ROOM,
    furnitureLayout: [
      piece('rug',              4.0, 5.0, 0,   84, 60, '#cbbfac'),
      piece('sofa',             3.8, 9.4, 180, 78, 34, '#cfcfca'),
      piece('coffee_table',     6.0, 6.5, 0,   36, 20, '#c9b79c'),
      piece('floor_lamp',      12.8, 1.2, 0,   14, 14),
      piece('indoor_plants',   13.2, 10.6, 0,  20, 20),
    ],
  },
};
const roomFor = (style) => STYLE_ROOMS[style] || DEMO_ROOM;

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

  function mount(style) {
    currentStyle = style;
    viewer?.dispose?.();
    // No scene colour: the canvas behind it carries the grid paper, which
    // already follows the page theme in CSS.
    viewer = mod.createRoomViewer(stage, { style, background: 'transparent' });
    viewer.controls.autoRotateSpeed = 0.55;
    viewer.controls.enableZoom = false;   // the hero must never eat page scroll
    viewer.controls.addEventListener('start', () => {
      userTookOver = true;
      syncSpin();
      stage.classList.add('has-interacted');
    });
    viewer.render(roomFor(style));
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
        // Each style has its own room, and the palette is baked in at
        // construction, so swap the whole viewer for the new style's room.
        mount(button.dataset.style);
      });
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
