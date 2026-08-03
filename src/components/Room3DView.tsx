import { useEffect, useRef } from 'react';
import type { IsoRoomInput } from '../utils/isoRoomRender';
// @ts-ignore - plain JS Three.js viewer (no types)
import { createRoomViewer } from '../../room3d/room3d.js';

// Map BluPrint style tags onto the viewer's palettes.
const STYLE_KEYS: Array<[string, string]> = [
  ['scandinav', 'scandinavian'], ['nordic', 'scandinavian'],
  ['boho', 'bohemian'], ['bohem', 'bohemian'],
  ['industr', 'industrial'],
  ['minimal', 'minimalist'],
];
function normStyle(tag?: string) {
  const t = (tag || '').toLowerCase();
  for (const [needle, key] of STYLE_KEYS) if (t.includes(needle)) return key;
  return 'modern';
}

function bbox(points?: Array<{ x: number; y: number }>) {
  if (!points || points.length < 3) return null;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

interface Props {
  isoRoom: IsoRoomInput;
  heightFt?: number;
  styleTag?: string;
  className?: string;
}

/** Orbitable 3D room built from the SAME data as the 2D/iso preview. */
export default function Room3DView({ isoRoom, heightFt = 9, styleTag, className = '' }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);

  // create the WebGL viewer once per style (palette is set at construction)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let viewer: any;
    try {
      viewer = createRoomViewer(el, { style: normStyle(styleTag) });
    } catch (e) {
      console.error('[Room3DView] WebGL init failed', e);
      el.innerHTML =
        '<div style="padding:16px;color:#888;font:14px system-ui">3D view needs WebGL — it may be disabled in this browser.</div>';
      return;
    }
    viewerRef.current = viewer;
    return () => { viewer?.dispose?.(); viewerRef.current = null; };
  }, [styleTag]);

  // (re)draw whenever the room or furniture placement changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const bb = bbox(isoRoom.roomPoints);
    const scale = bb && isoRoom.widthFt ? bb.w / isoRoom.widthFt : 20;
    viewer.render({
      widthFt: isoRoom.widthFt,
      lengthFt: isoRoom.lengthFt,
      heightFt,
      scale,
      roomPoints: isoRoom.roomPoints,
      furnitureLayout: (isoRoom.items || [])
        .filter((it) => !it.hidden)
        .map((it) => {
          const sc = it.scale || 1;
          return {
            category: it.category,
            x: it.x,
            y: it.y,
            rot: it.rotation || 0,
            wIn: it.item?.widthIn ? it.item.widthIn * sc : undefined,
            dIn: it.item?.depthIn ? it.item.depthIn * sc : undefined,
            color: it.color || it.item?.color,
          };
        }),
    });
  }, [isoRoom, heightFt, styleTag]);

  return (
    <div
      ref={ref}
      className={`room3d-view ${className}`.trim()}
      // overflow:hidden is a backstop: the canvas can never grow this box
      style={{ width: '100%', height: '100%', minHeight: 320, overflow: 'hidden' }}
    />
  );
}
