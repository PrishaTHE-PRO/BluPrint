import { useRef, useState, useEffect, useCallback } from 'react';
import type { Room, Style, FurnitureItem, RoomLayout } from '../types';
import { CATEGORY_LABELS } from '../utils/furnitureLayout';

// ─── Constants ──────────────────────────────────────────────────────────────

/** SVG pixels per foot in the floor-plan canvas */
const SCALE = 40;

/** Margin around the room polygon for dimension labels */
const MARGIN = 32;

/** Default furniture widths (inches) when the API doesn't supply them */
const DEFAULT_WIDTH_IN: Record<string, number> = {
  sofa:         84,
  accent_chair: 32,
  coffee_table: 48,
  rug:          96,
  floor_lamp:   12,
  side_table:   18,
};

/** Default furniture depths (inches) when the API doesn't supply them */
const DEFAULT_DEPTH_IN: Record<string, number> = {
  sofa:         36,
  accent_chair: 32,
  coffee_table: 24,
  rug:          72,
  floor_lamp:   12,
  side_table:   18,
};

/** Starting positions as fractions of room width/length */
const DEFAULT_POS_FRAC: Record<string, { xf: number; yf: number }> = {
  rug:          { xf: 0.20, yf: 0.28 },
  sofa:         { xf: 0.12, yf: 0.60 },
  coffee_table: { xf: 0.35, yf: 0.40 },
  floor_lamp:   { xf: 0.73, yf: 0.07 },
  accent_chair: { xf: 0.62, yf: 0.57 },
  side_table:   { xf: 0.04, yf: 0.46 },
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  room:             Room;
  style:            Style;
  furniture:        FurnitureItem[];
  roomLayout?:      RoomLayout | null;
  linkedCategory?:  string | null;
  onLinkCategory?:  (cat: string | null) => void;
}

/** Position in feet from the room's top-left origin */
interface PosFt { x: number; y: number }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function defaultPos(category: string, room: Room): PosFt {
  const frac = DEFAULT_POS_FRAC[category] ?? { xf: 0.35, yf: 0.35 };
  return {
    x: frac.xf * room.widthFt,
    y: frac.yf * room.lengthFt,
  };
}

function pieceSizeFt(item: FurnitureItem) {
  return {
    wFt: (item.widthIn ?? DEFAULT_WIDTH_IN[item.category] ?? 36) / 12,
    dFt: (item.depthIn ?? DEFAULT_DEPTH_IN[item.category] ?? 30) / 12,
  };
}

/**
 * Convert a point in the architecture editor's SVG space to feet.
 * Editor: 20 px/ft, room centered at (400, 250).
 */
function editorPtToFt(px: number, py: number, layout: RoomLayout) {
  const ES   = 20; // editor scale px/ft
  const rx   = 400 - (layout.widthFt * ES) / 2;
  const ry   = 250 - (layout.lengthFt * ES) / 2;
  return {
    x: (px - rx) / ES,
    y: (py - ry) / ES,
  };
}

// ─── Top-down furniture SVG icons ────────────────────────────────────────────

function SofaIcon({ w, d }: { w: number; d: number }) {
  const back = d * 0.28;
  const arm  = Math.max(4, w * 0.10);
  const inner = w - arm * 2;
  return (
    <g>
      <rect width={w} height={d} rx={3} fill="#E8DFC0" stroke="#0A3323" strokeWidth={1.5} />
      {/* back cushion */}
      <rect width={w} height={back} rx={2} fill="#C4B896" stroke="#0A3323" strokeWidth={1} />
      {/* left armrest */}
      <rect x={0} y={back} width={arm} height={d - back} rx={2} fill="#C4B896" stroke="#0A3323" strokeWidth={1} />
      {/* right armrest */}
      <rect x={w - arm} y={back} width={arm} height={d - back} rx={2} fill="#C4B896" stroke="#0A3323" strokeWidth={1} />
      {/* cushion seams */}
      <line x1={arm + inner / 3}     y1={back} x2={arm + inner / 3}     y2={d} stroke="#0A3323" strokeWidth={0.8} opacity={0.35} />
      <line x1={arm + (inner * 2) / 3} y1={back} x2={arm + (inner * 2) / 3} y2={d} stroke="#0A3323" strokeWidth={0.8} opacity={0.35} />
    </g>
  );
}

function ChairIcon({ w, d }: { w: number; d: number }) {
  const back = d * 0.30;
  const arm  = Math.max(3, w * 0.13);
  return (
    <g>
      <rect width={w} height={d} rx={3} fill="#E8DFC0" stroke="#0A3323" strokeWidth={1.5} />
      <rect width={w} height={back} rx={2} fill="#C4B896" stroke="#0A3323" strokeWidth={1} />
      <rect x={0}       y={back} width={arm} height={d - back - d * 0.12} rx={1} fill="#C4B896" stroke="#0A3323" strokeWidth={1} />
      <rect x={w - arm} y={back} width={arm} height={d - back - d * 0.12} rx={1} fill="#C4B896" stroke="#0A3323" strokeWidth={1} />
    </g>
  );
}

function CoffeeTableIcon({ w, d }: { w: number; d: number }) {
  const mg = Math.max(3, Math.min(w, d) * 0.12);
  return (
    <g>
      <rect width={w} height={d} rx={4} fill="#D4C49A" stroke="#0A3323" strokeWidth={1.5} />
      <rect x={mg} y={mg} width={w - mg * 2} height={d - mg * 2} rx={2}
            fill="none" stroke="#0A3323" strokeWidth={0.7} opacity={0.45} />
    </g>
  );
}

function RugIcon({ w, d }: { w: number; d: number }) {
  const mg = Math.max(3, Math.min(w, d) * 0.08);
  return (
    <g>
      <rect width={w} height={d} rx={6}
            fill="rgba(211,150,140,0.15)"
            stroke="rgba(211,150,140,0.75)"
            strokeWidth={1.5}
            strokeDasharray="5 3" />
      <rect x={mg} y={mg} width={w - mg * 2} height={d - mg * 2} rx={4}
            fill="none" stroke="rgba(211,150,140,0.45)" strokeWidth={1} />
    </g>
  );
}

function FloorLampIcon({ w, d }: { w: number; d: number }) {
  const r = Math.min(w, d) / 2 - 1;
  return (
    <g>
      <circle cx={w / 2} cy={d / 2} r={r}    fill="#F7F4D5" stroke="#0A3323" strokeWidth={1.5} />
      <circle cx={w / 2} cy={d / 2} r={r * 0.35} fill="#0A3323" />
    </g>
  );
}

function SideTableIcon({ w, d }: { w: number; d: number }) {
  const r  = Math.min(w, d) / 2 - 1;
  const r2 = r * 0.55;
  return (
    <g>
      <circle cx={w / 2} cy={d / 2} r={r}  fill="#D4C49A" stroke="#0A3323" strokeWidth={1.5} />
      <circle cx={w / 2} cy={d / 2} r={r2} fill="none"    stroke="#0A3323" strokeWidth={0.7} opacity={0.5} />
    </g>
  );
}

function FurnitureIcon({ item, wPx, dPx }: { item: FurnitureItem; wPx: number; dPx: number }) {
  switch (item.category) {
    case 'sofa':         return <SofaIcon w={wPx} d={dPx} />;
    case 'accent_chair': return <ChairIcon w={wPx} d={dPx} />;
    case 'coffee_table': return <CoffeeTableIcon w={wPx} d={dPx} />;
    case 'rug':          return <RugIcon w={wPx} d={dPx} />;
    case 'floor_lamp':   return <FloorLampIcon w={wPx} d={dPx} />;
    case 'side_table':   return <SideTableIcon w={wPx} d={dPx} />;
    default:
      return <rect width={wPx} height={dPx} rx={3} fill="#D4C49A" stroke="#0A3323" strokeWidth={1.5} />;
  }
}

// ─── Door & window marks (top-down architectural symbols) ────────────────────

function DoorMark({ sizePx }: { sizePx: number }) {
  // Centered on the snap point; line = wall opening, arc = door swing
  return (
    <g transform={`translate(${-sizePx / 2}, 0)`}>
      {/* wall gap */}
      <line x1={0} y1={0} x2={sizePx} y2={0} stroke="#0A3323" strokeWidth={3} strokeLinecap="round" />
      {/* swing arc */}
      <path d={`M ${sizePx} 0 A ${sizePx} ${sizePx} 0 0 1 0 ${sizePx}`}
            fill="none" stroke="#0A3323" strokeWidth={1.5}
            strokeDasharray="5 3" opacity={0.55} />
      {/* hinge wall */}
      <line x1={0} y1={0} x2={0} y2={sizePx} stroke="#D3968C" strokeWidth={4} strokeLinecap="round" />
    </g>
  );
}

function WindowMark({ sizePx }: { sizePx: number }) {
  return (
    <g transform={`translate(${-sizePx / 2}, -5)`}>
      <rect width={sizePx} height={10} rx={1}
            fill="rgba(131,212,224,0.35)" stroke="#0A3323" strokeWidth={1.5} />
      <line x1={5} y1={2.5} x2={sizePx - 5} y2={2.5} stroke="rgba(131,212,224,0.9)" strokeWidth={1.5} />
      <line x1={5} y1={7.5} x2={sizePx - 5} y2={7.5} stroke="rgba(131,212,224,0.9)" strokeWidth={1.5} />
    </g>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RoomSVG({ room, furniture, roomLayout, linkedCategory, onLinkCategory }: Props) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ category: string; offsetX: number; offsetY: number } | null>(null);

  const [positions, setPositions] = useState<Record<string, PosFt>>({});
  const [dragging,  setDragging]  = useState<string | null>(null);

  // Initialise default positions when furniture changes
  useEffect(() => {
    setPositions(prev => {
      const next = { ...prev };
      furniture.forEach(item => {
        if (!next[item.category]) {
          next[item.category] = defaultPos(item.category, room);
        }
      });
      return next;
    });
  }, [furniture]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Convert a pointer-event client coordinate to room-space feet
  const clientToFt = useCallback((e: React.PointerEvent): PosFt => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt  = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const sp = pt.matrixTransform(ctm.inverse());
    return {
      x: (sp.x - MARGIN) / SCALE,
      y: (sp.y - MARGIN) / SCALE,
    };
  }, []);

  const handlePointerDown = useCallback((category: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Capture on the SVG root so move events fire even when pointer leaves the piece
    svgRef.current?.setPointerCapture(e.pointerId);
    const clickFt = clientToFt(e);
    const pos     = positions[category] ?? defaultPos(category, room);
    dragRef.current = {
      category,
      offsetX: clickFt.x - pos.x,
      offsetY: clickFt.y - pos.y,
    };
    setDragging(category);
    onLinkCategory?.(category);
  }, [positions, clientToFt, room, onLinkCategory]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const clickFt = clientToFt(e);
    const item    = furniture.find(f => f.category === drag.category);
    if (!item) return;
    const { wFt, dFt } = pieceSizeFt(item);
    setPositions(prev => ({
      ...prev,
      [drag.category]: {
        x: Math.max(0, Math.min(room.widthFt  - wFt, clickFt.x - drag.offsetX)),
        y: Math.max(0, Math.min(room.lengthFt - dFt, clickFt.y - drag.offsetY)),
      },
    }));
  }, [furniture, clientToFt, room]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setDragging(null);
  }, []);

  // ── SVG viewBox ────────────────────────────────────────────────────────────

  const vbW = room.widthFt  * SCALE + 2 * MARGIN;
  const vbH = room.lengthFt * SCALE + 2 * MARGIN;

  // ── Room polygon (in SVG px) ────────────────────────────────────────────────

  let roomPolygonPts: Array<{ x: number; y: number }>;
  if (roomLayout && roomLayout.roomPoints.length >= 3) {
    roomPolygonPts = roomLayout.roomPoints.map(p => {
      const ft = editorPtToFt(p.x, p.y, roomLayout);
      return { x: ft.x * SCALE + MARGIN, y: ft.y * SCALE + MARGIN };
    });
  } else {
    // Fallback: plain rectangle from room dimensions
    roomPolygonPts = [
      { x: MARGIN,                        y: MARGIN },
      { x: room.widthFt  * SCALE + MARGIN, y: MARGIN },
      { x: room.widthFt  * SCALE + MARGIN, y: room.lengthFt * SCALE + MARGIN },
      { x: MARGIN,                        y: room.lengthFt * SCALE + MARGIN },
    ];
  }
  const roomPathD = roomPolygonPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';

  // ── Cutout sub-paths (punch holes in room polygon) ─────────────────────────

  let cutoutPathD = '';
  if (roomLayout) {
    roomLayout.cutouts.forEach(c => {
      const pts = c.points.map(p => {
        const ft = editorPtToFt(p.x, p.y, roomLayout);
        return { x: ft.x * SCALE + MARGIN, y: ft.y * SCALE + MARGIN };
      });
      cutoutPathD += ' ' + pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';
    });
  }

  // ── Doors & windows (converted to room-space SVG px) ───────────────────────

  const DOOR_PX   = 2.67 * SCALE; // 32 inch standard door
  const WINDOW_PX = 3.5  * SCALE; // ~42 inch window

  const layoutElements = roomLayout
    ? roomLayout.elements.map(el => {
        const ft = editorPtToFt(el.x, el.y, roomLayout);
        return { ...el, svgX: ft.x * SCALE + MARGIN, svgY: ft.y * SCALE + MARGIN };
      })
    : [];

  // ── Grid lines (1 ft intervals) ────────────────────────────────────────────

  const gridV = Array.from({ length: Math.floor(room.widthFt)  - 1 }, (_, i) => i + 1);
  const gridH = Array.from({ length: Math.floor(room.lengthFt) - 1 }, (_, i) => i + 1);

  // ── Sorted furniture (rug renders first / underneath) ─────────────────────

  const sorted = [...furniture].sort((a, b) =>
    a.category === 'rug' ? -1 : b.category === 'rug' ? 1 : 0,
  );

  return (
    <div
      className="garden-card rounded-2xl border border-[#F7F4D5]/10 p-4 animate-reveal w-full"
      style={{ animationDelay: '0.4s' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-base font-bold flex items-center gap-2">
          <iconify-icon icon="ph:layout-duotone" class="text-[#D3968C]" />
          2D Room Layout
        </h3>
        <span className="text-[10px] text-[#F7F4D5]/40 font-medium">
          Drag pieces to rearrange · hover to link
        </span>
      </div>

      {/* Floor plan SVG */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${vbW} ${vbH}`}
        className="w-full rounded-xl"
        style={{ maxHeight: '70vh', display: 'block' }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* ── Background ── */}
        <rect width={vbW} height={vbH} fill="rgba(247,244,213,0.06)" rx={12} />

        {/* ── Room fill + wall outline (with cutouts via even-odd) ── */}
        <path
          d={roomPathD + cutoutPathD}
          fill="#F7F4D5"
          fillRule="evenodd"
          stroke="#0A3323"
          strokeWidth={3}
          strokeLinejoin="round"
        />

        {/* ── 1-ft grid lines ── */}
        {gridV.map(i => (
          <line key={`v${i}`}
            x1={i * SCALE + MARGIN} y1={MARGIN}
            x2={i * SCALE + MARGIN} y2={room.lengthFt * SCALE + MARGIN}
            stroke="rgba(10,51,35,0.07)" strokeWidth={0.8}
          />
        ))}
        {gridH.map(i => (
          <line key={`h${i}`}
            x1={MARGIN} y1={i * SCALE + MARGIN}
            x2={room.widthFt * SCALE + MARGIN} y2={i * SCALE + MARGIN}
            stroke="rgba(10,51,35,0.07)" strokeWidth={0.8}
          />
        ))}

        {/* ── Doors & Windows ── */}
        {layoutElements.map(el => (
          <g key={el.id} transform={`translate(${el.svgX.toFixed(1)},${el.svgY.toFixed(1)}) rotate(${el.angle})`}>
            {el.type === 'door'
              ? <DoorMark   sizePx={DOOR_PX} />
              : <WindowMark sizePx={WINDOW_PX} />
            }
          </g>
        ))}

        {/* ── Dimension labels ── */}
        <text
          x={room.widthFt * SCALE / 2 + MARGIN}
          y={MARGIN / 2 + 4}
          textAnchor="middle"
          fontSize={11}
          fontWeight="700"
          fill="rgba(10,51,35,0.55)"
          fontFamily="Quicksand, sans-serif"
        >
          {room.widthFt} ft
        </text>
        <text
          x={MARGIN / 2 - 2}
          y={room.lengthFt * SCALE / 2 + MARGIN}
          textAnchor="middle"
          fontSize={11}
          fontWeight="700"
          fill="rgba(10,51,35,0.55)"
          fontFamily="Quicksand, sans-serif"
          transform={`rotate(-90, ${MARGIN / 2 - 2}, ${room.lengthFt * SCALE / 2 + MARGIN})`}
        >
          {room.lengthFt} ft
        </text>

        {/* ── Furniture pieces ── */}
        {sorted.map(item => {
          const pos    = positions[item.category] ?? defaultPos(item.category, room);
          const { wFt, dFt } = pieceSizeFt(item);
          const wPx    = wFt * SCALE;
          const dPx    = dFt * SCALE;
          const svgX   = pos.x * SCALE + MARGIN;
          const svgY   = pos.y * SCALE + MARGIN;
          const isLinked = linkedCategory === item.category;
          const isDimmed = Boolean(linkedCategory && linkedCategory !== item.category);
          const isRug    = item.category === 'rug';

          return (
            <g
              key={item.id}
              transform={`translate(${svgX.toFixed(1)}, ${svgY.toFixed(1)})`}
              opacity={isDimmed ? 0.22 : 1}
              style={{
                cursor:     dragging === item.category ? 'grabbing' : 'grab',
                transition: 'opacity 0.2s',
              }}
              onPointerDown={e => handlePointerDown(item.category, e)}
              onMouseEnter={() => onLinkCategory?.(item.category)}
              onMouseLeave={() => onLinkCategory?.(null)}
            >
              {/* Highlight ring when linked */}
              {isLinked && (
                <rect
                  x={-3} y={-3}
                  width={wPx + 6} height={dPx + 6}
                  rx={6}
                  fill="none"
                  stroke="#D3968C"
                  strokeWidth={2.5}
                />
              )}

              <FurnitureIcon item={item} wPx={wPx} dPx={dPx} />

              {/* Label (not on rug — too noisy) */}
              {!isRug && (
                <text
                  x={wPx / 2}
                  y={dPx / 2 + Math.min(4, dPx * 0.15)}
                  textAnchor="middle"
                  fontSize={Math.max(7, Math.min(10, wPx / 7))}
                  fontWeight="700"
                  fill="#0A3323"
                  opacity={0.65}
                  fontFamily="Quicksand, sans-serif"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {CATEGORY_LABELS[item.category] ?? item.category}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Category legend / hover targets */}
      <div className="mt-3 flex flex-wrap gap-1.5 px-1">
        {furniture.map(item => (
          <button
            key={item.id}
            type="button"
            className={[
              'text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all',
              linkedCategory === item.category
                ? 'bg-[#D3968C]/30 border-[#D3968C] text-[#F7F4D5]'
                : 'bg-[#105666]/20 border-[#F7F4D5]/10 text-[#F7F4D5]/60 hover:border-[#D3968C]/40',
            ].join(' ')}
            onMouseEnter={() => onLinkCategory?.(item.category)}
            onMouseLeave={() => onLinkCategory?.(null)}
          >
            {CATEGORY_LABELS[item.category] ?? item.category}
          </button>
        ))}
      </div>
    </div>
  );
}
