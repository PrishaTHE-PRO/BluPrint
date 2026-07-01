import { useRef, useState, useEffect, useCallback } from 'react';
import type { Room, Style, FurnitureItem } from '../types';
import { CATEGORY_LABELS } from '../utils/furnitureLayout';

interface Props {
  room:              Room;
  style:             Style;
  furniture:         FurnitureItem[];
  linkedCategory?:   string | null;
  onLinkCategory?:   (category: string | null) => void;
}

interface PiecePos {
  left: number;
  top:  number;
}

// Positions as % of container (piece left/top edge).
// All default positions are designed so that a ~25%-wide piece stays within bounds.
const DEFAULT_POS: Record<string, PiecePos> = {
  rug:          { left: 18,  top: 28 },
  sofa:         { left: 18,  top: 60 },
  coffee_table: { left: 36,  top: 40 },
  floor_lamp:   { left: 68,  top: 10 },
  accent_chair: { left: 63,  top: 58 },
  side_table:   { left: 5,   top: 44 },
};

const ROUND_CATEGORIES = new Set(['floor_lamp', 'side_table']);

const IMAGE_FALLBACK: Record<string, string> = {
  sofa:         'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=200',
  coffee_table: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&q=80&w=200',
  rug:          'https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=200',
  floor_lamp:   'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=200',
  accent_chair: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=200',
  side_table:   'https://images.unsplash.com/photo-1532372320572-cda25653a26d?auto=format&fit=crop&q=80&w=200',
};

function getPieceSize(item: FurnitureItem, room: Room) {
  const w = item.widthIn ?? 36;
  const d = item.depthIn ?? 36;
  const widthPct  = Math.min(30, Math.max(10, (w / 12 / room.widthFt)  * 100));
  const heightPct = Math.min(25, Math.max(10, (d / 12 / room.lengthFt) * 100));
  return { widthPct, heightPct };
}

function shortName(name: string, max = 16) {
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}

function LayoutPiece({
  item,
  room,
  pos,
  isRound,
  isRug,
  isActive,
  isLinked,
  isDimmed,
  onPointerDown,
  onLink,
}: {
  item:           FurnitureItem;
  room:           Room;
  pos:            PiecePos;
  isRound:        boolean;
  isRug:          boolean;
  isActive:       boolean;
  isLinked:       boolean;
  isDimmed:       boolean;
  onPointerDown:  (e: React.PointerEvent) => void;
  onLink?:        (category: string | null) => void;
}) {
  const [imgSrc, setImgSrc] = useState(item.imageUrl || IMAGE_FALLBACK[item.category] || '');

  useEffect(() => {
    setImgSrc(item.imageUrl || IMAGE_FALLBACK[item.category] || '');
  }, [item.id, item.imageUrl, item.category]);

  const { widthPct, heightPct } = getPieceSize(item, room);
  const size = isRound ? Math.max(widthPct, heightPct) : undefined;

  const zClass = isRug
    ? (isLinked ? 'z-10' : 'z-0')
    : (isLinked ? 'z-30' : 'z-10');

  return (
    <div
      title={item.name}
      className={[
        'absolute overflow-hidden transition-opacity duration-200 select-none',
        zClass,
        isLinked ? 'ring-2 ring-[#D3968C] ring-offset-1' : '',
        isDimmed ? 'opacity-30' : 'opacity-100',
      ].join(' ')}
      style={{
        left:         `${pos.left}%`,
        top:          `${pos.top}%`,
        width:        `${size ?? widthPct}%`,
        height:       `${size ?? heightPct}%`,
        borderRadius: isRound ? '50%' : isRug ? '0.5rem' : '0.75rem',
        border:       isRug
          ? '2px dashed rgba(211,150,140,0.6)'
          : '2px solid rgba(10,51,35,0.15)',
        boxShadow:    isActive
          ? '0 8px 24px rgba(0,0,0,0.3)'
          : '0 2px 8px rgba(0,0,0,0.12)',
        cursor:       isActive ? 'grabbing' : 'grab',
        touchAction:  'none',
      }}
      onPointerDown={onPointerDown}
      onMouseEnter={() => onLink?.(item.category)}
      onMouseLeave={() => onLink?.(null)}
    >
      <img
        src={imgSrc}
        alt={item.name}
        className={['w-full h-full object-cover pointer-events-none', isRug ? 'opacity-50' : ''].join(' ')}
        draggable={false}
        onError={() => setImgSrc(IMAGE_FALLBACK[item.category] ?? '')}
      />
      {!isRug && (
        <div className="absolute inset-x-0 bottom-0 bg-[#0A3323]/75 px-1 py-0.5 pointer-events-none">
          <span className="block text-[7px] font-bold text-[#F7F4D5] uppercase tracking-tight text-center leading-tight truncate">
            {shortName(item.name)}
          </span>
        </div>
      )}
    </div>
  );
}

export default function RoomSVG({ room, furniture, linkedCategory, onLinkCategory }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, PiecePos>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const dragRef = useRef<{
    category: string;
    offsetX:  number;
    offsetY:  number;
    widthPct: number;
    heightPct:number;
  } | null>(null);

  useEffect(() => {
    setPositions((prev) => {
      const next = { ...prev };
      furniture.forEach((item) => {
        if (!next[item.category]) {
          next[item.category] = DEFAULT_POS[item.category] ?? { left: 35, top: 35 };
        }
      });
      return next;
    });
  }, [furniture]);

  const clamp = useCallback((val: number, min: number, max: number) =>
    Math.max(min, Math.min(max, val)), []);

  const handlePointerDown = useCallback((
    category: string,
    e: React.PointerEvent,
    widthPct: number,
    heightPct: number,
  ) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const pos  = positions[category] ?? DEFAULT_POS[category] ?? { left: 35, top: 35 };
    const elLeft = (pos.left / 100) * rect.width;
    const elTop  = (pos.top  / 100) * rect.height;

    dragRef.current = {
      category,
      offsetX:   e.clientX - rect.left - elLeft,
      offsetY:   e.clientY - rect.top  - elTop,
      widthPct,
      heightPct,
    };
    setDragging(category);
    onLinkCategory?.(category);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  }, [positions, onLinkCategory]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag      = dragRef.current;
    const container = containerRef.current;
    if (!drag || !container) return;

    const rect    = container.getBoundingClientRect();
    const leftPct = ((e.clientX - rect.left - drag.offsetX) / rect.width)  * 100;
    const topPct  = ((e.clientY - rect.top  - drag.offsetY) / rect.height) * 100;

    setPositions((prev) => ({
      ...prev,
      [drag.category]: {
        left: clamp(leftPct, 1, 99 - drag.widthPct),
        top:  clamp(topPct,  1, 99 - drag.heightPct),
      },
    }));
  }, [clamp]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setDragging(null);
  }, []);

  // Rug first so it renders below other pieces
  const sorted = [...furniture].sort((a, b) =>
    a.category === 'rug' ? -1 : b.category === 'rug' ? 1 : 0,
  );

  return (
    <div className="garden-card rounded-2xl border border-[#F7F4D5]/10 p-4 animate-reveal w-full" style={{ animationDelay: '0.4s' }}>
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-base font-bold flex items-center gap-2">
          <iconify-icon icon="ph:layout-duotone" class="text-[#D3968C]" />
          2D Room Layout
        </h3>
        <span className="text-[10px] text-[#F7F4D5]/40 font-medium">Drag pieces to rearrange · hover to link</span>
      </div>

      <div
        ref={containerRef}
        className="relative aspect-square bg-[#F7F4D5] rounded-2xl overflow-hidden shadow-2xl"
        style={{ border: '8px solid rgba(10,51,35,0.05)' }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div className="absolute inset-8 border border-[#0A3323]/10 border-dashed pointer-events-none" />

        {/* Dimension labels */}
        <div
          className="absolute left-1.5 top-1/2 text-[10px] text-[#0A3323]/40 font-bold pointer-events-none"
          style={{ transform: 'translateY(-50%) rotate(-90deg)' }}
        >
          {room.lengthFt} ft
        </div>
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 text-[10px] text-[#0A3323]/40 font-bold pointer-events-none">
          {room.widthFt} ft
        </div>

        {sorted.map((item) => {
          const pos       = positions[item.category] ?? DEFAULT_POS[item.category] ?? { left: 35, top: 35 };
          const isLinked  = linkedCategory === item.category;
          const isDimmed  = Boolean(linkedCategory && linkedCategory !== item.category);
          const isRug     = item.category === 'rug';
          const { widthPct, heightPct } = getPieceSize(item, room);

          return (
            <LayoutPiece
              key={item.id}
              item={item}
              room={room}
              pos={pos}
              isRound={ROUND_CATEGORIES.has(item.category)}
              isRug={isRug}
              isActive={dragging === item.category}
              isLinked={isLinked}
              isDimmed={isDimmed}
              onLink={onLinkCategory}
              onPointerDown={(e) => handlePointerDown(item.category, e, widthPct, heightPct)}
            />
          );
        })}
      </div>

      {/* Category legend */}
      <div className="mt-3 flex flex-wrap gap-1.5 px-1">
        {furniture.map((item) => (
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
