// Click the dashboard mascot and it squishes while teal sparkles pop out to
// its sides. Timing and the "four quick clicks"
// payoff follow page-mascot's boop; the art is the original drawing.

// Teal shades from the site palette, light to deep.
const COLORS = ['#2f6f8f', '#4b8dbf', '#7ea8c9', '#3f8fa3', '#5fb3c4'];

// page-mascot's squash: per-keyframe easing on a linear effect.
const SQUASH: Keyframe[] = [
  { transform: 'scale(1, 1)', easing: 'ease-in' },
  { transform: 'scale(1.10, 0.86)', offset: 0.18, easing: 'ease-out' },
  { transform: 'scale(0.95, 1.08)', offset: 0.45, easing: 'ease-in-out' },
  { transform: 'scale(1.03, 0.97)', offset: 0.72, easing: 'ease-in-out' },
  { transform: 'scale(1, 1)' },
];
const SQUASH_MS = 420;
const BIG_AFTER = 4;        // quick clicks in a row for the big burst
const BIG_WINDOW = 1600;    // ms between clicks that still count as a row

const wrap = document.querySelector<HTMLElement>('.dashboard-character-wrap');
const still = wrap?.querySelector<HTMLImageElement>('img');

if (wrap && still) {
  const layer = document.createElement('div');
  layer.className = 'mascot-burst';
  layer.setAttribute('aria-hidden', 'true');
  wrap.appendChild(layer);
  wrap.classList.add('is-boopable');

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const boops = { count: 0, at: 0 };

  const spawn = (big: boolean) => {
    const box = still.getBoundingClientRect();
    const host = wrap.getBoundingClientRect();
    // Burst from the mascot's middle, in the wrap's coordinates.
    const ox = box.left - host.left + box.width / 2;
    const oy = box.top - host.top + box.height * 0.45;
    const n = big ? 26 : 14;
    const still_ = reduced();

    for (let i = 0; i < n; i++) {
      const el = document.createElement('iconify-icon');
      el.className = 'mascot-burst__icon';
      el.setAttribute('icon', 'ph:sparkle-fill');
      el.style.color = COLORS[(i * 3) % COLORS.length];
      el.style.left = `${ox}px`;
      el.style.top = `${oy}px`;
      el.style.fontSize = `${14 + Math.random() * (big ? 16 : 10)}px`;
      layer.appendChild(el);

      // Out to the sides: alternate left and right, fanning upward.
      const side = i % 2 === 0 ? -1 : 1;
      const angle = (-Math.PI / 2) + side * (0.45 + Math.random() * 1.0);
      const dist = (big ? 120 : 80) + Math.random() * (big ? 90 : 60);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const spin = (Math.random() - 0.5) * 90;
      const dur = 750 + Math.random() * 450;

      const frames: Keyframe[] = still_
        ? [{ opacity: 0, transform: `translate(calc(-50% + ${dx * 0.4}px), calc(-50% + ${dy * 0.4}px))` },
           { opacity: 1, offset: 0.3 },
           { opacity: 0, transform: `translate(calc(-50% + ${dx * 0.4}px), calc(-50% + ${dy * 0.4}px))` }]
        : [{ opacity: 0, transform: 'translate(-50%, -50%) scale(.3) rotate(0deg)' },
           { opacity: 1, transform: `translate(calc(-50% + ${dx * 0.55}px), calc(-50% + ${dy * 0.55}px)) scale(1.1) rotate(${spin * 0.5}deg)`, offset: 0.35 },
           { opacity: 0, transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 40}px)) scale(.8) rotate(${spin}deg)` }];
      const anim = el.animate(frames, { duration: dur, delay: Math.random() * (big ? 160 : 60), easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' });
      anim.onfinish = () => el.remove();
    }
  };

  const boop = () => {
    const now = Date.now();
    boops.count = now - boops.at < BIG_WINDOW ? boops.count + 1 : 1;
    boops.at = now;
    const big = boops.count >= BIG_AFTER;
    if (big) boops.count = 0;
    spawn(big);
    if (!reduced()) {
      // The image has the float animation on its transform, so the squash
      // goes on the wrap, pivoting at the feet.
      wrap.animate(SQUASH, { duration: SQUASH_MS, easing: 'linear' });
    }
  };

  still.addEventListener('click', boop);
}
