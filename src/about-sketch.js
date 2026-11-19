// about-sketch.js — the About page's hero card: the site's hand-drawn 3D room
// sketch (the same one on the dashboard and project cards), turning slowly on
// its own. Drag it (mouse, pen or finger) to spin it around and tip it up or
// down; let go and it coasts, then picks the slow turn back up.
//
// Each frame redraws the sketch from the new angle into the same <svg>, the
// way attachIsoTilt does for the room cards. The idle turn only runs while the
// card is on screen and the tab is in front; reduced motion keeps it still
// until the visitor drags it themselves.

import rough from 'roughjs/bundled/rough.esm.js';
import { renderIsoRoom } from '../iso-preview.js';

window.rough = window.rough || rough;

const blue = '#a7bdd6';
const blueDark = '#6f8fb2';
const wood = '#c4a574';
const cream = '#e8d9a8';
const green = '#5d8a62';

function piece(category, x, y, color, { rotation = 0, scale = 1, widthIn, depthIn } = {}) {
  return {
    category, x, y, rotation, scale, color,
    item: { ...(widthIn ? { widthIn } : {}), ...(depthIn ? { depthIn } : {}), color },
  };
}

// A small living room, in feet from the top-left corner like every saved room.
const ROOM = {
  _id: 'about-sketch',
  name: 'Living Room',
  widthFt: 13,
  lengthFt: 12,
  heightFt: 8,
  furnitureLayout: {
    items: [
      piece('rug', 2.5, 3.4, '#c9b8a0', { widthIn: 96, depthIn: 72 }),
      piece('sofa', 3.0, 0.6, blueDark),
      piece('coffee_table', 4.7, 5.0, wood),
      piece('accent_chair', 9.4, 5.4, '#8ea7c4', { rotation: 270 }),
      piece('side_table', 10.4, 1.0, wood),
      piece('floor_lamp', 11.9, 0.7, cream, { scale: 0.9 }),
      piece('indoor_plants', 11.3, 10.1, green, { scale: 0.85 }),
      piece('bookcase', 0.3, 4.2, blue, { rotation: 90, widthIn: 36, depthIn: 13 }),
    ],
  },
};
const OPTS = { floorLabel: `${ROOM.widthFt * ROOM.lengthFt} sq ft` };

const RAD = Math.PI / 180;
const IDLE_TURN_MS = 80000;          // one full idle turn
const IDLE_PITCH = 6 * RAD;          // a little above the standard view while idling
const PITCH_MIN = -12 * RAD;
const PITCH_MAX = 24 * RAD;
const DRAG_YAW = 0.55 * RAD;         // per pixel dragged sideways
const DRAG_PITCH = 0.3 * RAD;        // per pixel dragged up or down
const RESUME_AFTER_MS = 2200;        // idle turn picks back up this long after a drag

function mount(card) {
  // The slot is sized in CSS to the sketch's proportions before this runs, so
  // nothing shifts (and no stale drawing shows) when the room appears.
  const slot = card.querySelector('.about-sketch-slot') || card;
  const draw = (yaw, pitch) => {
    const tpl = document.createElement('template');
    tpl.innerHTML = (renderIsoRoom(ROOM, { ...OPTS, view: { yaw, pitch } }) || '').trim();
    const fresh = tpl.content.firstElementChild;
    if (!fresh) return;
    let svg = slot.querySelector('svg');
    if (!svg) {
      fresh.setAttribute('aria-hidden', 'true');
      fresh.removeAttribute('role');
      slot.replaceChildren(fresh);
      return;
    }
    svg.setAttribute('viewBox', fresh.getAttribute('viewBox'));
    svg.replaceChildren(...fresh.childNodes);
  };

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let yaw = 0, pitch = 0;
  let velYaw = 0;                    // radians per ms, for the coast after a drag
  let dragging = false, lastX = 0, lastY = 0, lastMoveAt = 0, releasedAt = -Infinity;
  let onScreen = true, raf = 0, last = 0;

  draw(0, 0);
  card.classList.add('is-sketch');

  const idleOn = () => !reduce?.matches && onScreen && !document.hidden;
  const coasting = () => Math.abs(velYaw) > 0.00002;

  const tick = (now) => {
    const dt = Math.min(64, now - last);
    last = now;
    if (!dragging) {
      if (coasting()) {
        yaw += velYaw * dt;
        velYaw *= Math.exp(-dt / 320);
      } else if (idleOn() && now - releasedAt > RESUME_AFTER_MS) {
        yaw += (Math.PI * 2 / IDLE_TURN_MS) * dt;
        // Ease the tip back toward the idle angle.
        pitch += (IDLE_PITCH - pitch) * (1 - Math.exp(-dt / 900));
      }
    }
    draw(yaw, pitch);
    const keepGoing = dragging || coasting() || idleOn();
    raf = keepGoing ? requestAnimationFrame(tick) : 0;
  };
  const wake = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  card.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    velYaw = 0;
    lastX = e.clientX; lastY = e.clientY; lastMoveAt = performance.now();
    card.classList.add('is-dragging');
    try { card.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
    wake();
  });
  card.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const now = performance.now();
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    // The camera turns the opposite way to the drag, so the room itself
    // follows the pointer: drag right, the room turns right.
    yaw -= dx * DRAG_YAW;
    pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + dy * DRAG_PITCH));
    const dtMove = Math.max(1, now - lastMoveAt);
    velYaw = (-dx * DRAG_YAW) / dtMove;
    lastX = e.clientX; lastY = e.clientY; lastMoveAt = now;
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    releasedAt = performance.now();
    // A pause before letting go means no fling.
    if (releasedAt - lastMoveAt > 80) velYaw = 0;
    velYaw = Math.max(-0.01, Math.min(0.01, velYaw));
    card.classList.remove('is-dragging');
    try { if (e?.pointerId != null && card.hasPointerCapture(e.pointerId)) card.releasePointerCapture(e.pointerId); } catch { /* never captured */ }
    wake();
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);

  // Arrow keys turn it too.
  card.addEventListener('keydown', (e) => {
    const step = 15 * RAD;
    if (e.key === 'ArrowLeft') yaw += step;
    else if (e.key === 'ArrowRight') yaw -= step;
    else if (e.key === 'ArrowUp') pitch = Math.max(PITCH_MIN, pitch - step / 2);
    else if (e.key === 'ArrowDown') pitch = Math.min(PITCH_MAX, pitch + step / 2);
    else return;
    e.preventDefault();
    releasedAt = performance.now();
    draw(yaw, pitch);
    wake();
  });

  document.addEventListener('visibilitychange', () => { if (idleOn()) wake(); });
  reduce?.addEventListener?.('change', () => { if (idleOn()) wake(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries.some((en) => en.isIntersecting);
      if (idleOn()) wake();
    }, { rootMargin: '80px' }).observe(card);
  }
  wake();
}

const card = document.querySelector('[data-about-sketch]');
if (card) {
  try { mount(card); }
  catch (error) { console.warn('[about] sketch unavailable, keeping the plan drawing', error); }
}
