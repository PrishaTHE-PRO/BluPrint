import { useCallback, useEffect, useRef, useState } from 'react';
import type { FurnitureItem, RenderItem, Room, RoomRender } from '../types';
import type { Placement } from './RoomSVG';
import { BuyButton } from './FurnitureCard';
import { authedFetch } from '../../firebase.mjs';

/**
 * The right pane on the results page when the room has a photo.
 *
 * Shows the user's own room with the recommended products composited into it
 * by the server (POST /api/rooms/:id/render), and lays hover hotspots over each
 * product with a Buy link. Rendering costs real money per call, so it only ever
 * runs from the two buttons here, never on mount or on a furniture drag.
 */

interface Props {
  room: Room;
  /** The visible in-room set, in the order the floor plan shows them. */
  items: FurnitureItem[];
  /** Live positions from the floor plan, in feet from the room's top-left. */
  placement: Placement;
  roomDims: { widthFt: number; lengthFt: number };
  linkedCategory?: string | null;
  onLinkCategory?: (category: string | null) => void;
  onRenderSaved: (render: RoomRender) => void;
}

interface ContentBox { left: number; top: number; width: number; height: number }

const LINES = [
  'Measuring your walls from the photo...',
  'Matching the sofa to its product shot...',
  'Keeping your windows exactly where they are...',
  'Arguing with the perspective, politely...',
  'Casting shadows that agree with your lamps...',
  'Making sure nothing blocks the door...',
  'Checking the rug is actually on the floor...',
  'Finding where each piece landed...',
];

const DEFAULT_WIDTH_IN = 30;
const DEFAULT_DEPTH_IN = 30;

// Hover boxes over the render are switched off for now: the outlined regions
// read as stickers on the picture. The server still computes and saves them
// with every render, so flipping this back on needs no new renders.
const SHOW_HOTSPOTS = false;

/**
 * One short placement note per piece for the image model, read off the plan
 * from the camera's point of view (plan top = back wall, plan bottom = the
 * camera). Percentages and wall adjacency rather than thirds, so a re-render
 * after moving a piece lands where the plan put it.
 */
export function buildLayoutHints(
  items: FurnitureItem[],
  placement: Placement,
  dims: { widthFt: number; lengthFt: number },
): string[] {
  const w = Math.max(1, dims.widthFt);
  const l = Math.max(1, dims.lengthFt);
  return items.slice(0, 8).map((item) => {
    const pos = placement.positions[item.category];
    if (!pos) return `${item.category}: anywhere it fits naturally`;
    const wFt = (item.widthIn ?? DEFAULT_WIDTH_IN) / 12;
    const dFt = (item.depthIn ?? DEFAULT_DEPTH_IN) / 12;
    const cx = pos.x + wFt / 2;
    const cy = pos.y + dFt / 2;
    const fx = Math.min(1, Math.max(0, cx / w));
    const fy = Math.min(1, Math.max(0, cy / l));
    const pct = Math.round(fx * 100);
    const touchesBack = pos.y <= 0.75;
    const touchesFront = pos.y + dFt >= l - 0.75;
    const touchesLeft = pos.x <= 0.75;
    const touchesRight = pos.x + wFt >= w - 0.75;
    const wall = touchesBack ? 'against the back wall'
      : touchesFront ? 'at the front of the room, nearest the camera'
      : touchesLeft ? 'against the left wall'
      : touchesRight ? 'against the right wall'
      : fy < 0.5 ? 'in the back half of the room, away from the walls' : 'in the front half of the room, away from the walls';
    const across = `${pct}% of the way across from the left wall`;
    const rot = placement.rotations[item.category] ?? 0;
    const faces = ['sofa', 'bed', 'accent_chair', 'desk'].includes(item.category)
      ? (rot === 180 ? ', facing the back wall' : ', facing the camera')
      : '';
    return `${item.category}: ${wall}, ${across}${faces}`.slice(0, 120);
  });
}

export default function RoomRenderView({
  room,
  items,
  placement,
  roomDims,
  linkedCategory,
  onLinkCategory,
  onRenderSaved,
}: Props) {
  const [rendering, setRendering] = useState(false);
  const [relocating, setRelocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [line, setLine] = useState(0);
  const [box, setBox] = useState<ContentBox | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const startedAt = useRef(0);

  const render = room.render ?? null;
  // Original / Rendered switch. Only offered once a render exists, and it
  // snaps back to the render whenever a new picture arrives.
  const [showOriginal, setShowOriginal] = useState(false);
  const canCompare = Boolean(render && room.photoUrl);
  const showingOriginal = canCompare && showOriginal;
  const shownUrl = showingOriginal ? room.photoUrl! : (render?.url ?? room.photoUrl ?? '');

  // Hover cards read from the render's stored items first: on a revisit they
  // exist before the furniture search has finished.
  const itemFor = useCallback((itemId: string, category: string): RenderItem | FurnitureItem | undefined => {
    return render?.items?.find((i) => i.id === itemId)
      ?? items.find((i) => i.id === itemId)
      ?? items.find((i) => i.category === category);
  }, [render, items]);

  // Where the picture sits inside the stage, for the hover layer. The image
  // is centred and capped in height, so it is measured directly.
  const measure = useCallback(() => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img) return;
    const sr = stage.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    setBox({ left: ir.left - sr.left, top: ir.top - sr.top, width: ir.width, height: ir.height });
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => { setShowOriginal(false); }, [render?.url]);

  // Progress is deliberately honest: it eases toward 90% and waits there.
  useEffect(() => {
    if (!rendering) { setPct(0); setLine(0); return; }
    startedAt.current = Date.now();
    const tick = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt.current) / 1000;
      setPct(Math.min(90, 90 * (1 - Math.exp(-elapsed / 22))));
    }, 200);
    const rotate = window.setInterval(() => setLine((n) => (n + 1) % LINES.length), 2600);
    return () => { window.clearInterval(tick); window.clearInterval(rotate); };
  }, [rendering]);

  const runRender = useCallback(async () => {
    if (rendering || items.length === 0) return;
    setRendering(true);
    setError(null);
    try {
      const body = {
        items: items.slice(0, 8).map((i) => ({
          id: i.id,
          category: i.category,
          name: i.name,
          brand: i.brand,
          price: i.price,
          imageUrl: i.imageUrl,
          buyUrl: i.buyUrl,
          widthIn: i.widthIn,
          depthIn: i.depthIn,
        })),
        layoutHints: buildLayoutHints(items, placement, roomDims),
      };
      const res = await authedFetch(`/api/rooms/${room.roomId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Render failed (${res.status})`);
      onRenderSaved(data as RoomRender);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Render failed');
    } finally {
      setRendering(false);
    }
  }, [rendering, items, placement, roomDims, room.roomId, onRenderSaved]);

  // Re-runs only the locate passes on the existing picture. Two Vision calls
  // rather than a new image edit, so it is the cheap way to fix the boxes.
  const refreshHotspots = useCallback(async () => {
    if (relocating || rendering || !render) return;
    setRelocating(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/rooms/${room.roomId}/render/hotspots`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Could not locate furniture (${res.status})`);
      onRenderSaved(data as RoomRender);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not locate furniture');
    } finally {
      setRelocating(false);
    }
  }, [relocating, rendering, render, room.roomId, onRenderSaved]);

  const link = (category: string | null) => onLinkCategory?.(category);

  return (
    <div
      className="room-render-view"
      aria-busy={rendering}
      onMouseLeave={() => link(null)}
    >
      <div className="room-render-view__head">
        <h3 className="text-base font-bold flex items-center gap-2 shrink-0">
          <iconify-icon icon="ph:image" class="text-[#D3968C]" />
          Your room
        </h3>
        <div className="room-render-view__toolbar">
        {canCompare && !rendering && (
          <div className="room-render-view__toggle" role="group" aria-label="Which picture to show">
            <button
              type="button"
              className={`room-render-view__toggle-btn${showingOriginal ? '' : ' is-on'}`}
              aria-pressed={!showingOriginal}
              onClick={() => setShowOriginal(false)}
            >
              Rendered
            </button>
            <button
              type="button"
              className={`room-render-view__toggle-btn${showingOriginal ? ' is-on' : ''}`}
              aria-pressed={showingOriginal}
              onClick={() => setShowOriginal(true)}
              title="Show the photo you uploaded, without the recommended pieces"
            >
              Original
            </button>
          </div>
        )}
        {render && (
          <button
            type="button"
            className="room-render-view__btn room-render-view__btn--small room-render-view__btn--ghost"
            onClick={refreshHotspots}
            disabled={relocating || rendering}
            title="Find each piece in this picture and move the floor plan to match, without generating a new picture"
          >
            <iconify-icon icon={relocating ? 'ph:circle-notch-bold' : 'ph:crosshair-simple-bold'} />
            {relocating ? 'Matching plan...' : 'Match plan to picture'}
          </button>
        )}
        {render && (
          <button
            type="button"
            className="room-render-view__btn room-render-view__btn--small"
            onClick={runRender}
            disabled={rendering || relocating || items.length === 0}
          >
            <iconify-icon icon="ph:arrows-clockwise-bold" /> Re-render
          </button>
        )}
        </div>
      </div>

      <div className="room-render-view__stage" ref={stageRef}>
        {shownUrl && (
          <img
            ref={imgRef}
            src={shownUrl}
            alt={showingOriginal ? 'Your room as photographed' : render ? 'Your room with the recommended furniture' : 'Your room'}
            className={`room-render-view__img${!render || rendering ? ' is-dimmed' : ''}`}
            onLoad={measure}
            draggable={false}
          />
        )}

        {SHOW_HOTSPOTS && render && box && !rendering && !relocating && !showingOriginal && (
          <div
            className="room-render-view__layer"
            style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
          >
            {render.hotspots.map((h) => {
              const product = itemFor(h.itemId, h.category);
              const flip = h.y + h.h > 0.62;
              const linked = linkedCategory === h.category;
              return (
                <div
                  key={`${h.category}-${h.itemId}`}
                  role="button"
                  tabIndex={0}
                  aria-label={product ? `${product.name}, ${product.brand}` : h.category}
                  className={`render-hotspot${flip ? ' is-flip' : ''}${linked ? ' is-linked' : ''}`}
                  style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, width: `${h.w * 100}%`, height: `${h.h * 100}%` }}
                  onMouseEnter={() => link(h.category)}
                  onFocus={() => link(h.category)}
                >
                  {product && (
                    <div className="render-hotspot__card">
                      {product.imageUrl && (
                        <img src={product.imageUrl} alt="" className="render-hotspot__thumb" loading="lazy" />
                      )}
                      <p className="render-hotspot__name">{product.name}</p>
                      <p className="render-hotspot__meta">
                        {product.brand}
                        {product.price > 0 ? ` · $${product.price.toLocaleString()}` : ''}
                      </p>
                      {product.buyUrl && (
                        <BuyButton href={product.buyUrl} className="px-3 py-1.5 rounded-lg text-xs min-w-[3.25rem]" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!render && !rendering && (
          <div className="room-render-view__center">
            <button
              type="button"
              className="room-render-view__btn"
              onClick={runRender}
              disabled={items.length === 0}
            >
              <iconify-icon icon="ph:sparkle-duotone" /> Render my room
            </button>
            <p className="room-render-view__note">
              {items.length === 0
                ? 'Add some furniture first, then render.'
                : 'Places your recommended pieces into this photo. Takes about a minute.'}
            </p>
          </div>
        )}

        {rendering && (
          <div className="room-render-view__progress" role="status" aria-live="polite">
            <div className="room-render-view__progress-card">
              <div className="room-render-view__progress-head">
                <span className="room-render-view__spin">
                  <iconify-icon icon="ph:armchair-duotone" />
                </span>
                <strong>Rendering your room</strong>
              </div>
              <p key={line} className="room-render-view__progress-line">{LINES[line]}</p>
              <div className="room-render-view__bar">
                <div style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        )}

        {error && !rendering && (
          <p className="room-render-view__error" role="alert">{error}</p>
        )}
      </div>

      {render && !rendering && (
        <p className="room-render-view__caption">
          {showingOriginal
            ? 'Your room as you photographed it. Switch to Rendered to see the recommended pieces in place.'
            : SHOW_HOTSPOTS
            ? 'Hover a piece to see the product. The plan is matched to this picture; move furniture in the plan, then re-render to update.'
            : 'Your room with the recommended pieces. The plan is matched to this picture; move furniture in the plan, then re-render to update.'}
        </p>
      )}
    </div>
  );
}
