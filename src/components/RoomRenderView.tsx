import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

/** "sofa: against the back wall, left third", built from thirds of each axis. */
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
    const cx = pos.x + ((item.widthIn ?? DEFAULT_WIDTH_IN) / 12) / 2;
    const cy = pos.y + ((item.depthIn ?? DEFAULT_DEPTH_IN) / 12) / 2;
    const fx = Math.min(1, Math.max(0, cx / w));
    const fy = Math.min(1, Math.max(0, cy / l));
    const depth = fy < 1 / 3 ? 'against the back wall' : fy < 2 / 3 ? 'in the middle of the room' : 'near the front, closest to the camera';
    const side = fx < 1 / 3 ? 'left third' : fx < 2 / 3 ? 'centre' : 'right third';
    return `${item.category}: ${depth}, ${side}`.slice(0, 120);
  });
}

/** Where an object-fit: contain image actually paints inside its box. */
function contentBoxFor(boxW: number, boxH: number, natW: number, natH: number): ContentBox {
  if (!boxW || !boxH || !natW || !natH) return { left: 0, top: 0, width: boxW, height: boxH };
  const scale = Math.min(boxW / natW, boxH / natH);
  const width = natW * scale;
  const height = natH * scale;
  return { left: (boxW - width) / 2, top: (boxH - height) / 2, width, height };
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
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
  const shownUrl = render?.url ?? room.photoUrl ?? '';
  const visibleIds = useMemo(() => items.map((i) => i.id), [items]);
  const stale = Boolean(render) && !sameIds(render!.itemIds, visibleIds);

  // Hover cards read from the render's stored items first: on a revisit they
  // exist before the furniture search has finished.
  const itemFor = useCallback((itemId: string, category: string): RenderItem | FurnitureItem | undefined => {
    return render?.items?.find((i) => i.id === itemId)
      ?? items.find((i) => i.id === itemId)
      ?? items.find((i) => i.category === category);
  }, [render, items]);

  // Track the painted image box so percentage hotspots stay aligned under
  // object-fit: contain, whatever the pane's aspect ratio does.
  const measure = useCallback(() => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img) return;
    setBox(contentBoxFor(stage.clientWidth, stage.clientHeight, img.naturalWidth, img.naturalHeight));
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [measure]);

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
      <div className="room-render-view__toolbar">
        {render && stale && !rendering && (
          <span className="room-render-view__badge" title="The pieces in the room no longer match this picture">
            Furniture changed since last render
          </span>
        )}
        {render && (
          <button
            type="button"
            className="room-render-view__btn room-render-view__btn--small room-render-view__btn--ghost"
            onClick={refreshHotspots}
            disabled={relocating || rendering}
            title="Find the furniture in this picture again without generating a new one"
          >
            <iconify-icon icon={relocating ? 'ph:circle-notch-bold' : 'ph:crosshair-simple-bold'} />
            {relocating ? 'Locating...' : 'Refresh hotspots'}
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

      <div className="room-render-view__stage" ref={stageRef}>
        {shownUrl && (
          <img
            ref={imgRef}
            src={shownUrl}
            alt={render ? 'Your room with the recommended furniture' : 'Your room'}
            className={`room-render-view__img${!render || rendering ? ' is-dimmed' : ''}`}
            onLoad={measure}
            draggable={false}
          />
        )}

        {render && box && !rendering && !relocating && (
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
          Hover a piece to see the product. Move furniture in the plan, then re-render to update.
        </p>
      )}
    </div>
  );
}
