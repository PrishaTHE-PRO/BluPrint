import { useEffect, useRef, useState } from 'react';

/**
 * Shown while furniture is being fetched — on a revisit, or after Regenerate.
 *
 * The wait is genuinely variable (a GPT plan plus a product search per
 * category, unless the server cache is warm), so the bar is deliberately
 * honest: it eases toward 90% and parks there until the real work finishes,
 * rather than pretending to know a percentage. A bar that sits at 100% while
 * nothing happens is worse than one that visibly slows down.
 */

const LINES = [
  'Measuring the walls twice…',
  'Arguing with a sofa about scale…',
  'Rejecting a very ugly lamp…',
  'Checking nothing blocks the door…',
  'Colour-matching to your photos…',
  'Talking the budget down…',
  'Nudging the rug a little left…',
  'Asking if that fits through the doorway…',
  'Politely declining a beanbag…',
  'Fluffing cushions that do not exist yet…',
];

export default function FurnitureLoadingOverlay({ open, label = 'Rebuilding your room' }: {
  open: boolean;
  label?: string;
}) {
  const [pct, setPct] = useState(0);
  const [line, setLine] = useState(0);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!open) { setPct(0); setLine(0); return; }
    startedAt.current = Date.now();

    // Ease toward 90% and hold. Fast at first so it feels responsive, slowing
    // as it goes so it never implies it is about to finish.
    const tick = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt.current) / 1000;
      setPct(Math.min(90, 90 * (1 - Math.exp(-elapsed / 3.2))));
    }, 120);

    const rotate = window.setInterval(() => {
      setLine((n) => (n + 1) % LINES.length);
    }, 2300);

    return () => { window.clearInterval(tick); window.clearInterval(rotate); };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        display: 'grid', placeItems: 'center',
        background: 'rgba(12, 18, 24, .55)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
      }}
    >
      <div
        style={{
          width: 'min(90vw, 420px)',
          padding: '26px 26px 24px',
          borderRadius: 22,
          background: 'var(--bp-surface, #fefcfa)',
          color: 'var(--bp-ink, #1c1714)',
          boxShadow: '0 24px 70px rgba(0,0,0,.35)',
          border: '1px solid var(--bp-border, rgba(28,23,20,.08))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span className="fl-spin" style={{ display: 'grid', placeItems: 'center', fontSize: 20, color: 'var(--bp-primary, #3d5a80)' }}>
            <iconify-icon icon="ph:armchair-duotone" />
          </span>
          <strong style={{ font: '600 15px "DM Sans", system-ui, sans-serif' }}>{label}</strong>
        </div>

        <p key={line} className="fl-line" style={{
          margin: '0 0 16px', minHeight: 20,
          font: '14px/1.4 "DM Sans", system-ui, sans-serif',
          color: 'var(--bp-muted, #7a7060)',
        }}>
          {LINES[line]}
        </p>

        <div style={{
          height: 8, borderRadius: 999, overflow: 'hidden',
          background: 'var(--bp-soft, #ede8e1)',
        }}>
          <div style={{
            width: `${pct}%`, height: '100%', borderRadius: 999,
            background: 'linear-gradient(90deg, var(--bp-primary, #3d5a80), #839958)',
            transition: 'width .25s ease-out',
          }} />
        </div>
      </div>

      <style>{`
        @keyframes fl-spin { to { transform: rotate(360deg); } }
        @keyframes fl-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
        .fl-spin { animation: fl-spin 2.4s linear infinite; }
        .fl-line { animation: fl-in .32s ease both; }
        @media (prefers-reduced-motion: reduce) {
          .fl-spin, .fl-line { animation: none; }
        }
      `}</style>
    </div>
  );
}
