import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import type { Room, Style, FurnitureItem, RoomLayout } from '../types';
import {
  CATEGORY_LABELS,
  STACK_PARENT,
  canStackTogether,
  isFloorCovering,
  isStackable,
  isSurface,
} from '../utils/furnitureLayout';
import type { FurnitureColorTones } from '../utils/furnitureColor';
import { tonesFrom } from '../utils/furnitureColor';
import { furnitureForm } from '../utils/furnitureShape';
import {
  architectureForbiddenZonesFromLayout,
  editorPtToFt as editorPtToFtShared,
  findValidFurniturePosition,
  furnitureBounds,
  pieceSizeFt,
  resolveFurniturePlacement,
  type ForbiddenRect,
  type PosFt,
} from '../utils/furnitureConstraints';

// ─── Constants ──────────────────────────────────────────────────────────────

/** SVG pixels per foot in the floor-plan canvas */
const SCALE = 40;

/** Margin around the room polygon for dimension labels */
const MARGIN = 32;

/** Starting positions as fractions of room width/length */
const DEFAULT_POS_FRAC: Record<string, { xf: number; yf: number }> = {
  // Living room
  rug:             { xf: 0.20, yf: 0.28 },
  sofa:            { xf: 0.12, yf: 0.60 },
  coffee_table:    { xf: 0.35, yf: 0.40 },
  floor_lamp:      { xf: 0.73, yf: 0.07 },
  accent_chair:    { xf: 0.62, yf: 0.57 },
  side_table:      { xf: 0.04, yf: 0.46 },
  // Bedroom
  bed:             { xf: 0.22, yf: 0.08 },
  nightstand:      { xf: 0.04, yf: 0.10 },
  dresser:         { xf: 0.72, yf: 0.42 },
  bedroom_rug:     { xf: 0.18, yf: 0.48 },
  wardrobe:        { xf: 0.04, yf: 0.68 },
  bedside_lamp:    { xf: 0.06, yf: 0.12 },
  reading_nook:    { xf: 0.68, yf: 0.68 },
  // Kitchen
  bar_stool:       { xf: 0.35, yf: 0.55 },
  pendant_light:   { xf: 0.45, yf: 0.20 },
  kitchen_rug:     { xf: 0.30, yf: 0.40 },
  kitchen_storage: { xf: 0.70, yf: 0.15 },
  island_cart:     { xf: 0.22, yf: 0.38 },
  kitchen_shelf:   { xf: 0.60, yf: 0.08 },
  // Bathroom
  vanity:          { xf: 0.08, yf: 0.08 },
  bath_mirror:     { xf: 0.12, yf: 0.04 },
  bath_storage:    { xf: 0.65, yf: 0.08 },
  bath_mat:        { xf: 0.22, yf: 0.55 },
  bath_light:      { xf: 0.40, yf: 0.04 },
  shower_curtain:  { xf: 0.55, yf: 0.06 },
  bathtub:         { xf: 0.55, yf: 0.08 },
  standing_shower: { xf: 0.62, yf: 0.08 },
  // Home office
  desk:            { xf: 0.08, yf: 0.08 },
  office_chair:    { xf: 0.18, yf: 0.28 },
  bookshelf:       { xf: 0.65, yf: 0.08 },
  desk_lamp:       { xf: 0.08, yf: 0.04 },
  storage_cabinet: { xf: 0.70, yf: 0.50 },
  monitor_stand:   { xf: 0.14, yf: 0.06 },
  // Dining room
  dining_table:    { xf: 0.22, yf: 0.28 },
  dining_chair:    { xf: 0.55, yf: 0.30 },
  dining_rug:      { xf: 0.14, yf: 0.18 },
  sideboard:       { xf: 0.65, yf: 0.60 },
  dining_light:    { xf: 0.42, yf: 0.10 },
  bar_cabinet:     { xf: 0.65, yf: 0.08 },
  // Nursery
  crib:            { xf: 0.18, yf: 0.12 },
  nursery_dresser: { xf: 0.65, yf: 0.08 },
  rocking_chair:   { xf: 0.55, yf: 0.55 },
  nursery_rug:     { xf: 0.14, yf: 0.42 },
  nursery_shelf:   { xf: 0.65, yf: 0.38 },
  nursery_lamp:    { xf: 0.04, yf: 0.08 },
};

/** Furniture orientation chosen to match the wall or anchor it belongs to. */
const DEFAULT_ROTATION: Record<string, number> = {
  sofa: 180,
  side_table: 180,
  floor_lamp: 180,
  wardrobe: 180,
  nursery_shelf: 180,
  storage_cabinet: 180,
  sideboard: 180,
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  room:             Room;
  style:            Style;
  furniture:        FurnitureItem[];
  roomLayout?:      RoomLayout | null;
  linkedCategory?:  string | null;
  onLinkCategory?:  (cat: string | null) => void;
  onRemove?:        (cat: string) => void;
  /** Restored placement from a saved layout; applied once when it arrives. */
  initialPlacement?: Placement | null;
  /** Fires whenever a piece is dragged or rotated, so the parent can save it. */
  onPlacementChange?: (placement: Placement) => void;
  /** Dominant / palette color per furniture category for 2D fills. */
  colorByCategory?: Record<string, string>;
}

export interface Placement {
  positions: Record<string, PosFt>;
  rotations: Record<string, number>;
  scales: Record<string, number>;
}

export type { PosFt };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function defaultPos(category: string, room: Room): PosFt {
  const frac = DEFAULT_POS_FRAC[category] ?? { xf: 0.35, yf: 0.35 };
  return {
    x: frac.xf * room.widthFt,
    y: frac.yf * room.lengthFt,
  };
}

function defaultRotation(category: string) {
  return DEFAULT_ROTATION[category] ?? 0;
}

/**
 * Produce a practical first-pass layout from furniture relationships rather
 * than scattering every category at an unrelated room percentage.
 */
function preferredFurniturePosition(
  item: FurnitureItem,
  positions: Record<string, PosFt>,
  furniture: FurnitureItem[],
  roomWidthFt: number,
  roomLengthFt: number,
): PosFt {
  const { wFt, dFt } = pieceSizeFt(item);
  const inset = 0.35;
  const gap = 0.5;
  const centered = {
    x: (roomWidthFt - wFt) / 2,
    y: (roomLengthFt - dFt) / 2,
  };
  const anchor = (category: string) => {
    const anchorItem = furniture.find(candidate => candidate.category === category);
    const position = positions[category];
    return anchorItem && position
      ? { position, size: pieceSizeFt(anchorItem) }
      : null;
  };

  switch (item.category) {
    // Living room: seating faces the center, with tables and lighting nearby.
    case 'sofa':
      return { x: centered.x, y: roomLengthFt - dFt - inset };
    case 'coffee_table': {
      const sofa = anchor('sofa');
      return sofa
        ? { x: sofa.position.x + (sofa.size.wFt - wFt) / 2, y: sofa.position.y - dFt - 1.5 }
        : centered;
    }
    case 'rug':
      return centered;
    case 'side_table': {
      const sofa = anchor('sofa');
      return sofa
        ? { x: sofa.position.x - wFt - gap, y: sofa.position.y + sofa.size.dFt - dFt }
        : { x: inset, y: roomLengthFt - dFt - inset };
    }
    case 'floor_lamp': {
      const sofa = anchor('sofa');
      return sofa
        ? { x: sofa.position.x + sofa.size.wFt + gap, y: sofa.position.y + sofa.size.dFt - dFt }
        : { x: roomWidthFt - wFt - inset, y: roomLengthFt - dFt - inset };
    }

    // Bedroom: headboard on the back wall, clear foot traffic, storage on
    // opposite walls — no chair cluster along one edge.
    case 'bed':
      return {
        x: Math.max(inset, (roomWidthFt - wFt) / 2),
        y: inset + Math.min(0.6, roomLengthFt * 0.04),
      };
    case 'nightstand': {
      const bed = anchor('bed');
      return bed
        ? {
            x: Math.max(inset, bed.position.x - wFt - gap),
            y: bed.position.y + Math.max(0, bed.size.dFt * 0.08),
          }
        : { x: inset, y: inset };
    }
    case 'bedside_lamp': {
      const nightstand = anchor('nightstand');
      return nightstand
        ? {
            x: nightstand.position.x + (nightstand.size.wFt - wFt) / 2,
            y: nightstand.position.y + Math.max(0, (nightstand.size.dFt - dFt) / 2),
          }
        : { x: inset, y: inset };
    }
    case 'bedroom_rug': {
      const bed = anchor('bed');
      if (!bed) return centered;
      // Soft landing at the foot of the bed, still centered on the mattress.
      return {
        x: bed.position.x + (bed.size.wFt - wFt) / 2,
        y: Math.min(
          roomLengthFt - dFt - inset,
          bed.position.y + bed.size.dFt * 0.55,
        ),
      };
    }
    case 'dresser': {
      const bed = anchor('bed');
      // Opposite side wall from the nightstand, mid-room so the foot stays open.
      return {
        x: roomWidthFt - wFt - inset,
        y: bed
          ? Math.min(
              roomLengthFt - dFt - inset,
              Math.max(inset, bed.position.y + bed.size.dFt * 0.35),
            )
          : Math.max(inset, roomLengthFt * 0.38),
      };
    }
    case 'wardrobe':
      // Far corner on the nightstand wall — not stacked with the dresser.
      return { x: inset, y: roomLengthFt - dFt - inset };
    case 'reading_nook':
    case 'rocking_chair': {
      const bed = anchor('bed');
      // Quiet corner past the foot of the bed, with walking space.
      if (bed) {
        return {
          x: Math.min(
            roomWidthFt - wFt - inset,
            Math.max(inset, bed.position.x + bed.size.wFt + 1.25),
          ),
          y: Math.min(
            roomLengthFt - dFt - inset,
            Math.max(inset, bed.position.y + bed.size.dFt + 1.6),
          ),
        };
      }
      return { x: roomWidthFt - wFt - inset, y: roomLengthFt - dFt - inset };
    }
    case 'accent_chair': {
      // Living rooms: face the coffee table. Bedrooms: one lounge corner only.
      const table = anchor('coffee_table');
      if (table) {
        return {
          x: table.position.x + table.size.wFt + 1,
          y: table.position.y + (table.size.dFt - dFt) / 2,
        };
      }
      const bed = anchor('bed');
      if (bed) {
        return {
          x: Math.min(
            roomWidthFt - wFt - inset,
            Math.max(inset, bed.position.x + bed.size.wFt + 1.25),
          ),
          y: Math.min(
            roomLengthFt - dFt - inset,
            Math.max(inset, bed.position.y + bed.size.dFt + 1.6),
          ),
        };
      }
      return { x: roomWidthFt - wFt - inset, y: roomLengthFt - dFt - inset };
    }
    case 'workspace_desk':
    case 'vanity_station':
      // Side wall below the dresser line so the bed wall stays clear.
      return {
        x: roomWidthFt - wFt - inset,
        y: Math.max(inset, roomLengthFt * 0.55),
      };
    case 'bookcase':
      return { x: inset, y: Math.max(inset, roomLengthFt * 0.42) };
    case 'full_length_mirror':
      return { x: roomWidthFt - wFt - inset, y: inset };
    case 'floating_shelves':
    case 'wall_art':
      return { x: roomWidthFt - wFt - inset, y: inset + 0.8 };
    case 'smart_lighting':
      return { x: roomWidthFt - wFt - inset, y: roomLengthFt - dFt - inset };

    // Work and dining zones are centered around their main functional object.
    case 'desk':
      return { x: centered.x, y: inset };
    case 'office_chair': {
      const desk = anchor('desk');
      return desk
        ? { x: desk.position.x + (desk.size.wFt - wFt) / 2, y: desk.position.y + desk.size.dFt + 1 }
        : centered;
    }
    case 'desk_lamp':
    case 'monitor_stand': {
      const desk = anchor('desk');
      return desk
        ? {
            x: desk.position.x + (desk.size.wFt - wFt) / 2,
            // Monitor sits toward the back edge; lamp sits centered on the desk top.
            y: item.category === 'monitor_stand'
              ? desk.position.y + Math.max(0, desk.size.dFt * 0.12)
              : desk.position.y + Math.max(0, (desk.size.dFt - dFt) / 2),
          }
        : { x: inset, y: inset };
    }
    case 'dining_table':
    case 'dining_rug':
    case 'island_cart':
    case 'kitchen_rug':
    case 'bath_mat':
    case 'nursery_rug':
      return centered;
    case 'dining_chair': {
      const table = anchor('dining_table');
      return table
        ? { x: table.position.x + table.size.wFt + gap, y: table.position.y + (table.size.dFt - dFt) / 2 }
        : { x: roomWidthFt - wFt - inset, y: centered.y };
    }
    case 'bar_stool': {
      const island = anchor('island_cart');
      return island
        ? { x: island.position.x + (island.size.wFt - wFt) / 2, y: island.position.y + island.size.dFt + gap }
        : centered;
    }
    case 'pendant_light': {
      const island = anchor('island_cart');
      return island
        ? { x: island.position.x + (island.size.wFt - wFt) / 2, y: island.position.y - dFt - gap }
        : centered;
    }

    // Large storage and plumbing pieces stay against room edges.
    case 'bookshelf':
    case 'kitchen_storage':
    case 'bath_storage':
    case 'nursery_dresser':
    case 'bar_cabinet':
      return { x: roomWidthFt - wFt - inset, y: inset };
    case 'kitchen_shelf':
    case 'vanity':
    case 'crib':
      return { x: inset, y: inset };
    case 'bath_mirror':
    case 'bath_light': {
      const vanity = anchor('vanity') || anchor('vanity_station');
      return vanity
        ? {
            x: vanity.position.x + (vanity.size.wFt - wFt) / 2,
            // Sit on the vanity top, nudged toward the wall edge.
            y: vanity.position.y + Math.max(0, vanity.size.dFt * 0.08),
          }
        : { x: inset, y: inset };
    }
    case 'nursery_lamp': {
      const dresser = anchor('nursery_dresser');
      return dresser
        ? {
            x: dresser.position.x + (dresser.size.wFt - wFt) / 2,
            y: dresser.position.y + Math.max(0, (dresser.size.dFt - dFt) / 2),
          }
        : { x: inset, y: roomLengthFt - dFt - inset };
    }
    case 'indoor_plants': {
      const parentCat = STACK_PARENT.indoor_plants;
      const parent = (parentCat && anchor(parentCat))
        || anchor('side_table')
        || anchor('nightstand')
        || anchor('desk')
        || anchor('dresser');
      return parent
        ? {
            x: parent.position.x + (parent.size.wFt - wFt) / 2,
            y: parent.position.y + Math.max(0, (parent.size.dFt - dFt) / 2),
          }
        : { x: inset, y: roomLengthFt - dFt - inset };
    }
    case 'storage_cabinet':
    case 'sideboard':
    case 'nursery_shelf':
      return { x: roomWidthFt - wFt - inset, y: roomLengthFt - dFt - inset };
    case 'shower_curtain': {
      const tub = anchor('bathtub') || anchor('standing_shower');
      if (tub) {
        // Straight curtain rod along the near long edge of the fixture.
        return {
          x: tub.position.x + Math.max(0, (tub.size.wFt - wFt) / 2),
          y: tub.position.y + tub.size.dFt + 0.15,
        };
      }
      return { x: centered.x, y: inset };
    }
    case 'bathtub':
      return { x: roomWidthFt - wFt - inset, y: inset };
    case 'standing_shower':
      return { x: roomWidthFt - wFt - inset, y: inset };
    case 'dining_light': {
      const table = anchor('dining_table');
      return table
        ? { x: table.position.x + (table.size.wFt - wFt) / 2, y: table.position.y - dFt - gap }
        : centered;
    }
    default:
      return defaultPos(item.category, {
        roomId: '',
        name: '',
        widthFt: roomWidthFt,
        lengthFt: roomLengthFt,
        heightFt: 0,
        sqft: roomWidthFt * roomLengthFt,
      });
  }
}

function placedFurnitureZones(
  positions: Record<string, PosFt>,
  furniture: FurnitureItem[],
  rotations: Record<string, number>,
  scales: Record<string, number>,
  excludedCategory: string,
): ForbiddenRect[] {
  if (isFloorCovering(excludedCategory)) return [];
  return furniture
    .filter(item =>
      item.category !== excludedCategory
      && !isFloorCovering(item.category)
      && !canStackTogether(excludedCategory, item.category)
      && positions[item.category]
    )
    .map(item => furnitureBounds(
      positions[item.category],
      item,
      rotations[item.category] ?? 0,
      scales[item.category] ?? 1,
    ));
}

function editorPtToFt(px: number, py: number, layout: RoomLayout) {
  return editorPtToFtShared(px, py, layout.roomPoints);
}

/**
 * Return the canvas dimensions in feet, derived from the roomLayout polygon
 * bounding box when available (more accurate than the stored widthFt/lengthFt
 * which can drift if the user drags vertices without updating the inputs).
 */
function canvasDimsFt(room: Room, layout: RoomLayout | null | undefined) {
  if (!layout || layout.roomPoints.length < 2) {
    return { widthFt: room.widthFt, lengthFt: room.lengthFt };
  }
  const xs = layout.roomPoints.map(p => p.x);
  const ys = layout.roomPoints.map(p => p.y);
  const ES = 20;
  return {
    widthFt:  (Math.max(...xs) - Math.min(...xs)) / ES,
    lengthFt: (Math.max(...ys) - Math.min(...ys)) / ES,
  };
}

// ─── Top-down furniture SVG icons ────────────────────────────────────────────

function SofaIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  const back = d * 0.28;
  const arm  = Math.max(4, w * 0.10);
  const inner = w - arm * 2;
  return (
    <g>
      <rect width={w} height={d} rx={3} fill={t.light} stroke="#0A3323" strokeWidth={1.5} />
      <rect width={w} height={back} rx={2} fill={t.dark} stroke="#0A3323" strokeWidth={1} />
      <rect x={0} y={back} width={arm} height={d - back} rx={2} fill={t.mid} stroke="#0A3323" strokeWidth={1} />
      <rect x={w - arm} y={back} width={arm} height={d - back} rx={2} fill={t.mid} stroke="#0A3323" strokeWidth={1} />
      <line x1={arm + inner / 3}     y1={back} x2={arm + inner / 3}     y2={d} stroke="#0A3323" strokeWidth={0.8} opacity={0.35} />
      <line x1={arm + (inner * 2) / 3} y1={back} x2={arm + (inner * 2) / 3} y2={d} stroke="#0A3323" strokeWidth={0.8} opacity={0.35} />
    </g>
  );
}

function ChairIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  const back = d * 0.30;
  const arm  = Math.max(3, w * 0.13);
  return (
    <g>
      <rect width={w} height={d} rx={3} fill={t.light} stroke="#0A3323" strokeWidth={1.5} />
      <rect width={w} height={back} rx={2} fill={t.dark} stroke="#0A3323" strokeWidth={1} />
      <rect x={0}       y={back} width={arm} height={d - back - d * 0.12} rx={1} fill={t.mid} stroke="#0A3323" strokeWidth={1} />
      <rect x={w - arm} y={back} width={arm} height={d - back - d * 0.12} rx={1} fill={t.mid} stroke="#0A3323" strokeWidth={1} />
    </g>
  );
}

function CoffeeTableIcon({
  w, d, t, form = 'default',
}: { w: number; d: number; t: FurnitureColorTones; form?: 'default' | 'round_table' | 'oval_table' }) {
  if (form === 'round_table' || form === 'oval_table') {
    const rx = form === 'oval_table' ? w / 2 - 1 : Math.min(w, d) / 2 - 1;
    const ry = form === 'oval_table' ? d / 2 - 1 : rx;
    const cx = w / 2;
    const cy = d / 2;
    const inner = 0.72;
    return (
      <g>
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={t.base} stroke="#0A3323" strokeWidth={1.5} />
        <ellipse
          cx={cx} cy={cy} rx={rx * inner} ry={ry * inner}
          fill="none" stroke="#0A3323" strokeWidth={0.7} opacity={0.45}
        />
      </g>
    );
  }
  const mg = Math.max(3, Math.min(w, d) * 0.12);
  return (
    <g>
      <rect width={w} height={d} rx={4} fill={t.base} stroke="#0A3323" strokeWidth={1.5} />
      <rect x={mg} y={mg} width={w - mg * 2} height={d - mg * 2} rx={2}
            fill="none" stroke="#0A3323" strokeWidth={0.7} opacity={0.45} />
    </g>
  );
}

function BeanBagIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  const cx = w / 2;
  const cy = d / 2;
  const rx = w / 2 - 1;
  const ry = d / 2 - 1;
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={t.light} stroke="#0A3323" strokeWidth={1.5} />
      <ellipse
        cx={cx} cy={cy + ry * 0.08} rx={rx * 0.72} ry={ry * 0.55}
        fill={t.base} stroke="#0A3323" strokeWidth={0.8} opacity={0.9}
      />
      <path
        d={`M ${cx - rx * 0.35} ${cy - ry * 0.15} Q ${cx} ${cy + ry * 0.05} ${cx + rx * 0.35} ${cy - ry * 0.1}`}
        fill="none" stroke="#0A3323" strokeWidth={0.7} opacity={0.4}
      />
    </g>
  );
}

function LoungeChairIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  const back = d * 0.22;
  const arm = Math.max(4, w * 0.12);
  return (
    <g>
      {/* Deep lounge seat */}
      <rect width={w} height={d} rx={8} fill={t.light} stroke="#0A3323" strokeWidth={1.5} />
      {/* Curved-looking back */}
      <rect width={w} height={back} rx={7} fill={t.dark} stroke="#0A3323" strokeWidth={1} />
      {/* Soft arms */}
      <rect x={0} y={back} width={arm} height={d - back} rx={5} fill={t.mid} stroke="#0A3323" strokeWidth={1} />
      <rect x={w - arm} y={back} width={arm} height={d - back} rx={5} fill={t.mid} stroke="#0A3323" strokeWidth={1} />
      {/* Seat cushion */}
      <rect
        x={arm + 2} y={back + 2}
        width={Math.max(4, w - arm * 2 - 4)} height={Math.max(4, d - back - 4)}
        rx={6} fill={t.base} stroke="#0A3323" strokeWidth={0.7} opacity={0.85}
      />
    </g>
  );
}

function RugIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  const mg = Math.max(3, Math.min(w, d) * 0.08);
  return (
    <g>
      <rect width={w} height={d} rx={6}
            fill={t.light}
            stroke={t.dark}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            opacity={0.9}
      />
      <rect x={mg} y={mg} width={w - mg * 2} height={d - mg * 2} rx={4}
            fill="none" stroke={t.mid} strokeWidth={1} opacity={0.6} />
    </g>
  );
}

/** Thin straight curtain — vertical pleats, not a floor mat box. */
function ShowerCurtainIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  const folds = Math.max(5, Math.round(w / 10));
  const lines = Array.from({ length: folds }, (_, i) => {
    const x = ((i + 0.5) / folds) * w;
    return (
      <line
        key={i}
        x1={x} y1={1}
        x2={x} y2={Math.max(2, d - 1)}
        stroke={i % 2 === 0 ? t.dark : t.mid}
        strokeWidth={1.1}
        opacity={0.85}
      />
    );
  });
  return (
    <g>
      <rect width={w} height={d} rx={1.5} fill={t.light} stroke="#0A3323" strokeWidth={1.2} />
      <line x1={1} y1={1.5} x2={w - 1} y2={1.5} stroke="#0A3323" strokeWidth={1.4} />
      {lines}
    </g>
  );
}

function BathtubIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  const rx = Math.max(8, w * 0.48);
  const ry = Math.max(6, d * 0.42);
  const cx = w / 2;
  const cy = d / 2;
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={t.light} stroke="#0A3323" strokeWidth={1.5} />
      <ellipse cx={cx} cy={cy} rx={rx * 0.72} ry={ry * 0.62} fill={t.base} stroke="#0A3323" strokeWidth={1} opacity={0.85} />
      <circle cx={cx + rx * 0.35} cy={cy - ry * 0.15} r={Math.max(2, Math.min(w, d) * 0.05)} fill={t.dark} opacity={0.55} />
    </g>
  );
}

function StandingShowerIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  const mg = Math.max(2, Math.min(w, d) * 0.08);
  return (
    <g>
      <rect width={w} height={d} rx={2} fill={t.light} stroke="#0A3323" strokeWidth={1.5} opacity={0.55} />
      <rect x={mg} y={mg} width={w - mg * 2} height={d - mg * 2} rx={1.5}
            fill="none" stroke="#0A3323" strokeWidth={1.2} strokeDasharray="4 2" />
      <circle cx={w * 0.72} cy={d * 0.28} r={Math.max(2.5, Math.min(w, d) * 0.07)} fill={t.dark} opacity={0.7} />
      <line x1={w * 0.72} y1={d * 0.28} x2={w * 0.55} y2={d * 0.55} stroke={t.mid} strokeWidth={1.2} />
    </g>
  );
}

function FloorLampIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  const r = Math.min(w, d) / 2 - 1;
  return (
    <g>
      <circle cx={w / 2} cy={d / 2} r={r}    fill={t.light} stroke="#0A3323" strokeWidth={1.5} />
      <circle cx={w / 2} cy={d / 2} r={r * 0.35} fill={t.dark} />
    </g>
  );
}

function SideTableIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  const r  = Math.min(w, d) / 2 - 1;
  const r2 = r * 0.55;
  return (
    <g>
      <circle cx={w / 2} cy={d / 2} r={r}  fill={t.base} stroke="#0A3323" strokeWidth={1.5} />
      <circle cx={w / 2} cy={d / 2} r={r2} fill="none"    stroke="#0A3323" strokeWidth={0.7} opacity={0.5} />
    </g>
  );
}

// ── Bedroom icons ─────────────────────────────────────────────────────────────

function BedIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  const headH  = Math.max(6, d * 0.18);
  const pilW   = w * 0.28;
  const pilH   = Math.max(5, d * 0.16);
  const pilY   = headH + Math.max(3, d * 0.05);
  const pilGap = (w - pilW * 2) / 3;
  return (
    <g>
      <rect width={w} height={d} rx={3} fill={t.light} stroke="#0A3323" strokeWidth={1.5} />
      <rect width={w} height={headH} rx={2} fill={t.dark} stroke="#0A3323" strokeWidth={1} />
      <rect x={pilGap} y={pilY} width={pilW} height={pilH} rx={3}
            fill={t.base} stroke="#0A3323" strokeWidth={0.8} opacity={0.9} />
      <rect x={pilGap * 2 + pilW} y={pilY} width={pilW} height={pilH} rx={3}
            fill={t.base} stroke="#0A3323" strokeWidth={0.8} opacity={0.9} />
    </g>
  );
}

function NightstandIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  const mg = Math.max(3, Math.min(w, d) * 0.15);
  return (
    <g>
      <rect width={w} height={d} rx={3} fill={t.base} stroke="#0A3323" strokeWidth={1.5} />
      <line x1={mg} y1={d / 2} x2={w - mg} y2={d / 2} stroke="#0A3323" strokeWidth={0.8} opacity={0.5} />
      <circle cx={w / 2} cy={d / 2} r={2} fill="#0A3323" opacity={0.4} />
    </g>
  );
}

function DresserIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  const rows = 3;
  const mgX = Math.max(3, w * 0.06);
  const mgY = Math.max(2, d * 0.12);
  const innerH = Math.max(4, d - mgY * 2);
  return (
    <g>
      <rect width={w} height={d} rx={3} fill={t.mid} stroke="#0A3323" strokeWidth={1.5} />
      <line
        x1={mgX * 0.4} y1={d - 1.5} x2={w - mgX * 0.4} y2={d - 1.5}
        stroke="#0A3323" strokeWidth={2} opacity={0.35} strokeLinecap="round"
      />
      {Array.from({ length: rows }, (_, i) => {
        const y0 = mgY + (i / rows) * innerH;
        const y1 = mgY + ((i + 1) / rows) * innerH;
        const midY = (y0 + y1) / 2;
        return (
          <g key={i}>
            <rect
              x={mgX} y={y0 + 1}
              width={w - mgX * 2} height={Math.max(2, y1 - y0 - 2)}
              rx={1.5} fill={t.light} stroke="#0A3323" strokeWidth={0.75} opacity={0.95}
            />
            <circle cx={w / 2} cy={midY} r={1.7} fill="#0A3323" opacity={0.4} />
          </g>
        );
      })}
    </g>
  );
}

function WardrobeIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  const mid = w / 2;
  return (
    <g>
      <rect width={w} height={d} rx={3} fill={t.base} stroke="#0A3323" strokeWidth={1.5} />
      <line x1={mid} y1={0} x2={mid} y2={d} stroke="#0A3323" strokeWidth={1} opacity={0.5} />
      <circle cx={mid - 6} cy={d / 2} r={2} fill="#0A3323" opacity={0.4} />
      <circle cx={mid + 6} cy={d / 2} r={2} fill="#0A3323" opacity={0.4} />
    </g>
  );
}

function DeskIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  const surface = d * 0.55;
  return (
    <g>
      <rect width={w} height={d} rx={3} fill={t.base} stroke="#0A3323" strokeWidth={1.5} />
      <line x1={0} y1={surface} x2={w} y2={surface} stroke="#0A3323" strokeWidth={0.7} opacity={0.4} />
    </g>
  );
}

function DiningTableIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  const mg = Math.max(3, Math.min(w, d) * 0.1);
  return (
    <g>
      <rect width={w} height={d} rx={5} fill={t.base} stroke="#0A3323" strokeWidth={1.5} />
      <rect x={mg} y={mg} width={w - mg * 2} height={d - mg * 2} rx={3}
            fill="none" stroke="#0A3323" strokeWidth={0.7} opacity={0.4} />
    </g>
  );
}

function ShelfIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  return (
    <g>
      <rect width={w} height={d} rx={2} fill={t.base} stroke="#0A3323" strokeWidth={1.5} />
      {[0.33, 0.66].map(frac => (
        <line key={frac} x1={w * frac} y1={0} x2={w * frac} y2={d}
              stroke="#0A3323" strokeWidth={0.7} opacity={0.4} />
      ))}
    </g>
  );
}

function CribIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  const slats = Math.max(3, Math.round(w / 14));
  const gap   = w / (slats + 1);
  return (
    <g>
      <rect width={w} height={d} rx={4} fill={t.light} stroke="#0A3323" strokeWidth={1.5} />
      {Array.from({ length: slats }, (_, i) => (
        <line key={i}
          x1={(i + 1) * gap} y1={d * 0.1}
          x2={(i + 1) * gap} y2={d * 0.9}
          stroke="#0A3323" strokeWidth={1} opacity={0.3}
        />
      ))}
    </g>
  );
}

function LampIcon({ w, d, t }: { w: number; d: number; t: FurnitureColorTones }) {
  return <FloorLampIcon w={w} d={d} t={t} />;
}

function FurnitureIcon({ item, wPx, dPx, color }: { item: FurnitureItem; wPx: number; dPx: number; color?: string }) {
  const t = tonesFrom(color, item.category);
  const form = furnitureForm(item.category, item.name);
  const p = { w: wPx, d: dPx, t };
  switch (item.category) {
    case 'sofa':            return <SofaIcon {...p} />;
    case 'accent_chair':
      if (form === 'beanbag') return <BeanBagIcon {...p} />;
      if (form === 'lounge_chair') return <LoungeChairIcon {...p} />;
      return <ChairIcon {...p} />;
    case 'coffee_table':    return <CoffeeTableIcon {...p} form={form === 'round_table' || form === 'oval_table' ? form : 'default'} />;
    case 'rug':             return <RugIcon {...p} />;
    case 'floor_lamp':      return <FloorLampIcon {...p} />;
    case 'side_table':
      if (form === 'oval_table') return <CoffeeTableIcon {...p} form="oval_table" />;
      if (form === 'round_table') return <CoffeeTableIcon {...p} form="round_table" />;
      return <SideTableIcon {...p} />;
    case 'bed':             return <BedIcon {...p} />;
    case 'nightstand':      return <NightstandIcon {...p} />;
    case 'dresser':         return <DresserIcon {...p} />;
    case 'bedroom_rug':     return <RugIcon {...p} />;
    case 'wardrobe':        return <WardrobeIcon {...p} />;
    case 'bedside_lamp':    return <LampIcon {...p} />;
    case 'bar_stool':       return <ChairIcon {...p} />;
    case 'island_cart':     return <DiningTableIcon {...p} />;
    case 'kitchen_shelf':   return <ShelfIcon {...p} />;
    case 'kitchen_storage': return <DresserIcon {...p} />;
    case 'pendant_light':   return <FloorLampIcon {...p} />;
    case 'kitchen_rug':     return <RugIcon {...p} />;
    case 'dining_table':
      if (form === 'round_table' || form === 'oval_table') {
        return <CoffeeTableIcon {...p} form={form} />;
      }
      return <DiningTableIcon {...p} />;
    case 'dining_chair':    return <ChairIcon {...p} />;
    case 'dining_rug':      return <RugIcon {...p} />;
    case 'sideboard':       return <DresserIcon {...p} />;
    case 'dining_light':    return <FloorLampIcon {...p} />;
    case 'bar_cabinet':     return <WardrobeIcon {...p} />;
    case 'desk':            return <DeskIcon {...p} />;
    case 'office_chair':    return <ChairIcon {...p} />;
    case 'bookshelf':       return <ShelfIcon {...p} />;
    case 'desk_lamp':       return <LampIcon {...p} />;
    case 'storage_cabinet': return <WardrobeIcon {...p} />;
    case 'monitor_stand':   return <CoffeeTableIcon {...p} />;
    case 'crib':            return <CribIcon {...p} />;
    case 'nursery_dresser': return <DresserIcon {...p} />;
    case 'rocking_chair':
      if (form === 'beanbag') return <BeanBagIcon {...p} />;
      return <ChairIcon {...p} />;
    case 'nursery_rug':     return <RugIcon {...p} />;
    case 'nursery_shelf':   return <ShelfIcon {...p} />;
    case 'nursery_lamp':    return <LampIcon {...p} />;
    case 'vanity':          return <DresserIcon {...p} />;
    case 'bath_mirror':     return <CoffeeTableIcon {...p} />;
    case 'bath_storage':    return <ShelfIcon {...p} />;
    case 'bath_mat':        return <RugIcon {...p} />;
    case 'bath_light':      return <LampIcon {...p} />;
    case 'shower_curtain':  return <ShowerCurtainIcon {...p} />;
    case 'bathtub':         return <BathtubIcon {...p} />;
    case 'standing_shower': return <StandingShowerIcon {...p} />;
    case 'reading_nook':
      if (form === 'beanbag') return <BeanBagIcon {...p} />;
      return <LoungeChairIcon {...p} />;
    case 'smart_lighting':     return <LampIcon {...p} />;
    case 'floating_shelves':   return <ShelfIcon {...p} />;
    case 'indoor_plants':      return <FloorLampIcon {...p} />;
    case 'full_length_mirror': return <CoffeeTableIcon {...p} />;
    case 'workspace_desk':     return <DeskIcon {...p} />;
    case 'vanity_station':     return <DresserIcon {...p} />;
    case 'bookcase':           return <ShelfIcon {...p} />;
    default:
      return <rect width={wPx} height={dPx} rx={3} fill={t.base} stroke="#0A3323" strokeWidth={1.5} />;
  }
}

// ─── Door & window marks (top-down architectural symbols) ────────────────────

function DoorMark({ sizePx }: { sizePx: number }) {
  // Centered on the snap point; line = wall opening, arc = door swing
  return (
    <g transform={`translate(${-sizePx / 2}, 0)`}>
      {/* wall gap */}
      <line x1={0} y1={0} x2={sizePx} y2={0} stroke="#0A3323" strokeWidth={4} strokeLinecap="round" />
      {/* swing arc */}
      <path d={`M ${sizePx} 0 A ${sizePx} ${sizePx} 0 0 1 0 ${sizePx}`}
            fill="none" stroke="#294F7D" strokeWidth={2.6}
            strokeDasharray="5 2.5" opacity={0.95} />
      {/* open door leaf */}
      <line x1={0} y1={0} x2={0} y2={sizePx} stroke="#294F7D" strokeWidth={5.5} strokeLinecap="round" />
      <circle cx={0} cy={0} r={3.5} fill="#294F7D" />
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

export default function RoomSVG({
  room, furniture, roomLayout, linkedCategory, onLinkCategory, onRemove,
  initialPlacement, onPlacementChange, colorByCategory,
}: Props) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ category: string; offsetX: number; offsetY: number } | null>(null);
  const rotateRef = useRef<{
    category: string;
    center: PosFt;
    pointerStartAngle: number;
    rotationStart: number;
  } | null>(null);
  const resizeRef = useRef<{
    category: string;
    center: PosFt;
    pointerStartDistance: number;
    scaleStart: number;
  } | null>(null);
  const seededRef = useRef(false);

  const [positions,  setPositions]  = useState<Record<string, PosFt>>({});
  const [rotations,  setRotations]  = useState<Record<string, number>>({});
  const [scales,     setScales]     = useState<Record<string, number>>({});
  const [dragging,   setDragging]   = useState<string | null>(null);
  const [rotating,   setRotating]   = useState<string | null>(null);
  const [resizing,   setResizing]   = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Seed from a saved layout exactly once — re-validate against room/cutouts
  // so restored placements cannot sit in holes or outside the room.
  useEffect(() => {
    if (seededRef.current || !initialPlacement) return;
    seededRef.current = true;
    const { widthFt, lengthFt } = canvasDimsFt(room, roomLayout);
    const zones = architectureForbiddenZonesFromLayout(roomLayout);
    const nextPositions: Record<string, PosFt> = { ...initialPlacement.positions };
    const nextRotations = { ...initialPlacement.rotations };
    const nextScales = { ...initialPlacement.scales };

    furniture.forEach((item) => {
      const rotation = nextRotations[item.category] ?? defaultRotation(item.category);
      const scale = nextScales[item.category] ?? 1;
      const occupied = placedFurnitureZones(nextPositions, furniture, nextRotations, nextScales, item.category);
      const desired = nextPositions[item.category]
        ?? preferredFurniturePosition(item, nextPositions, furniture, widthFt, lengthFt);
      const resolved = resolveFurniturePlacement(
        desired,
        item,
        rotation,
        widthFt,
        lengthFt,
        [...zones, ...occupied],
        scale,
      );
      nextPositions[item.category] = resolved.position;
      nextScales[item.category] = resolved.scale;
    });

    setPositions(nextPositions);
    setRotations(nextRotations);
    setScales(nextScales);
  }, [initialPlacement, furniture, room, roomLayout]);

  // Report placement upward so Save Layout can capture it.
  useEffect(() => {
    onPlacementChange?.({ positions, rotations, scales });
  }, [positions, rotations, scales, onPlacementChange]);

  // Canvas dimensions — driven by the actual polygon bounding box when available
  // so the viewport, grid, labels, and drag clamping all agree.
  const { widthFt: cW, lengthFt: cL } = canvasDimsFt(room, roomLayout);
  const forbiddenZones = useMemo<ForbiddenRect[]>(
    () => architectureForbiddenZonesFromLayout(roomLayout),
    [roomLayout],
  );

  // Initialise default positions when furniture changes — keep clear of cutouts.
  useEffect(() => {
    setPositions((prev) => {
      const next = { ...prev };
      const workingScales = { ...scales };
      const scaleUpdates: Record<string, number> = {};

      furniture.forEach((item) => {
        const occupiedZones = placedFurnitureZones(
          next,
          furniture,
          rotations,
          workingScales,
          item.category,
        );
        const rotation = rotations[item.category] ?? defaultRotation(item.category);
        const scale = workingScales[item.category] ?? 1;
        const resolved = resolveFurniturePlacement(
          next[item.category] ?? preferredFurniturePosition(item, next, furniture, cW, cL),
          item,
          rotation,
          cW,
          cL,
          [...forbiddenZones, ...occupiedZones],
          scale,
        );
        next[item.category] = resolved.position;
        workingScales[item.category] = resolved.scale;
        if (Math.abs(resolved.scale - scale) > 0.001) {
          scaleUpdates[item.category] = resolved.scale;
        }
      });

      if (Object.keys(scaleUpdates).length > 0) {
        setScales((prevScales) => ({ ...prevScales, ...scaleUpdates }));
      }
      return next;
    });
  }, [furniture, forbiddenZones, room, rotations, scales, cW, cL]);

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
    if (e.button !== 0) return; // right-click handled by onContextMenu
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
    setSelectedCategory(category);
    onLinkCategory?.(category);
  }, [positions, clientToFt, room, onLinkCategory]);

  const handleRotatePointerDown = useCallback((category: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const item = furniture.find(candidate => candidate.category === category);
    if (!item) return;
    const position = positions[category] ?? defaultPos(category, room);
    const { wFt, dFt } = pieceSizeFt(item, scales[category] ?? 1);
    const center = { x: position.x + wFt / 2, y: position.y + dFt / 2 };
    const pointer = clientToFt(e);
    rotateRef.current = {
      category,
      center,
      pointerStartAngle: Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180 / Math.PI,
      rotationStart: rotations[category] ?? defaultRotation(category),
    };
    svgRef.current?.setPointerCapture(e.pointerId);
    setRotating(category);
    setSelectedCategory(category);
    onLinkCategory?.(category);
  }, [furniture, positions, room, rotations, scales, clientToFt, onLinkCategory]);

  const handleResizePointerDown = useCallback((category: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const item = furniture.find(candidate => candidate.category === category);
    if (!item) return;
    const scale = scales[category] ?? 1;
    const position = positions[category] ?? defaultPos(category, room);
    const { wFt, dFt } = pieceSizeFt(item, scale);
    const center = { x: position.x + wFt / 2, y: position.y + dFt / 2 };
    const pointer = clientToFt(e);
    resizeRef.current = {
      category,
      center,
      pointerStartDistance: Math.max(0.1, Math.hypot(pointer.x - center.x, pointer.y - center.y)),
      scaleStart: scale,
    };
    svgRef.current?.setPointerCapture(e.pointerId);
    setResizing(category);
    setSelectedCategory(category);
    onLinkCategory?.(category);
  }, [furniture, positions, room, scales, clientToFt, onLinkCategory]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const resizingPiece = resizeRef.current;
    if (resizingPiece || rotateRef.current || dragRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (resizingPiece) {
      const pointer = clientToFt(e);
      const distance = Math.hypot(
        pointer.x - resizingPiece.center.x,
        pointer.y - resizingPiece.center.y,
      );
      const nextScale = Math.max(
        0.5,
        Math.min(2, resizingPiece.scaleStart * distance / resizingPiece.pointerStartDistance),
      );
      const item = furniture.find(candidate => candidate.category === resizingPiece.category);
      if (!item) return;
      const rotation = rotations[resizingPiece.category] ?? defaultRotation(resizingPiece.category);
      const { wFt, dFt } = pieceSizeFt(item, nextScale);
      const occupiedZones = placedFurnitureZones(positions, furniture, rotations, scales, resizingPiece.category);
      setScales(prev => ({ ...prev, [resizingPiece.category]: nextScale }));
      setPositions(prev => ({
        ...prev,
        [resizingPiece.category]: findValidFurniturePosition(
          {
            x: resizingPiece.center.x - wFt / 2,
            y: resizingPiece.center.y - dFt / 2,
          },
          item,
          rotation,
          cW,
          cL,
          [...forbiddenZones, ...occupiedZones],
          nextScale,
        ),
      }));
      return;
    }

    const rotatingPiece = rotateRef.current;
    if (rotatingPiece) {
      const pointer = clientToFt(e);
      const pointerAngle = Math.atan2(
        pointer.y - rotatingPiece.center.y,
        pointer.x - rotatingPiece.center.x,
      ) * 180 / Math.PI;
      const nextRotation = rotatingPiece.rotationStart
        + pointerAngle
        - rotatingPiece.pointerStartAngle;
      const item = furniture.find(candidate => candidate.category === rotatingPiece.category);
      if (item) {
        const scale = scales[rotatingPiece.category] ?? 1;
        const { wFt, dFt } = pieceSizeFt(item, scale);
        const occupiedZones = placedFurnitureZones(positions, furniture, rotations, scales, rotatingPiece.category);
        const desired = {
          x: rotatingPiece.center.x - wFt / 2,
          y: rotatingPiece.center.y - dFt / 2,
        };
        setPositions(prev => ({
          ...prev,
          [rotatingPiece.category]: findValidFurniturePosition(
            desired,
            item,
            nextRotation,
            cW,
            cL,
            [...forbiddenZones, ...occupiedZones],
            scale,
          ),
        }));
      }
      setRotations(prev => ({ ...prev, [rotatingPiece.category]: nextRotation }));
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const clickFt = clientToFt(e);
    const item    = furniture.find(f => f.category === drag.category);
    if (!item) return;
    const rotation = rotations[drag.category] ?? defaultRotation(drag.category);
    const scale = scales[drag.category] ?? 1;
    setPositions(prev => {
      const occupiedZones = placedFurnitureZones(prev, furniture, rotations, scales, drag.category);
      return {
        ...prev,
        [drag.category]: findValidFurniturePosition(
        {
          x: clickFt.x - drag.offsetX,
          y: clickFt.y - drag.offsetY,
        },
        item,
        rotation,
        cW,
        cL,
        [...forbiddenZones, ...occupiedZones],
        scale,
      ),
      };
    });
  }, [furniture, rotations, scales, clientToFt, cW, cL, forbiddenZones]);

  const handlePointerUp = useCallback((e?: React.PointerEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      if (svgRef.current?.hasPointerCapture(e.pointerId)) {
        svgRef.current.releasePointerCapture(e.pointerId);
      }
    }
    dragRef.current = null;
    rotateRef.current = null;
    resizeRef.current = null;
    setDragging(null);
    setRotating(null);
    setResizing(null);
  }, []);

  const handleContextMenu = useCallback((category: string, e: React.MouseEvent) => {
    e.preventDefault();
    const item = furniture.find(f => f.category === category);
    if (!item) return;
    const nextRotation = ((rotations[category] ?? defaultRotation(category)) + 90) % 360;
    const scale = scales[category] ?? 1;
    setRotations(prev => ({ ...prev, [category]: nextRotation }));
    setPositions(prev => {
      const occupiedZones = placedFurnitureZones(prev, furniture, rotations, scales, category);
      return {
        ...prev,
        [category]: findValidFurniturePosition(
        prev[category] ?? defaultPos(category, room),
        item,
        nextRotation,
        cW,
        cL,
        [...forbiddenZones, ...occupiedZones],
        scale,
      ),
      };
    });
  }, [furniture, rotations, scales, room, cW, cL, forbiddenZones]);

  // ── SVG viewBox (sized to the actual polygon bounding box) ─────────────────

  const vbW = cW * SCALE + 2 * MARGIN;
  const vbH = cL * SCALE + 2 * MARGIN;

  // ── Room polygon (in SVG px) ────────────────────────────────────────────────

  let roomPolygonPts: Array<{ x: number; y: number }>;
  if (roomLayout && roomLayout.roomPoints.length >= 3) {
    roomPolygonPts = roomLayout.roomPoints.map(p => {
      const ft = editorPtToFt(p.x, p.y, roomLayout);
      return { x: ft.x * SCALE + MARGIN, y: ft.y * SCALE + MARGIN };
    });
  } else {
    // Fallback: plain rectangle from canvas dimensions
    roomPolygonPts = [
      { x: MARGIN,              y: MARGIN },
      { x: cW * SCALE + MARGIN, y: MARGIN },
      { x: cW * SCALE + MARGIN, y: cL * SCALE + MARGIN },
      { x: MARGIN,              y: cL * SCALE + MARGIN },
    ];
  }
  const roomPathD = roomPolygonPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';

  // ── Cutout sub-paths (punch holes in room polygon via even-odd fill) ────────

  const cutoutPolygons = roomLayout
    ? roomLayout.cutouts.map(cutout => {
      const points = cutout.points.map(p => {
        const ft = editorPtToFt(p.x, p.y, roomLayout);
        return { x: ft.x * SCALE + MARGIN, y: ft.y * SCALE + MARGIN };
      });
      const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';
      // Cutouts are stored p0 → p1 → p2 → p3; p0 → p1 is always the open wall edge.
      return { points, path, outsideEdge: 0 };
    })
    : [];
  const cutoutPathD = cutoutPolygons.map(cutout => ` ${cutout.path}`).join('');

  // ── Doors & windows (editor SVG px → room-space SVG px) ───────────────────

  const DOOR_PX   = 2.67 * SCALE; // 32 inch standard door
  const WINDOW_PX = 3.5  * SCALE; // ~42 inch window

  const layoutElements = roomLayout
    ? roomLayout.elements.map(el => {
        const ft = editorPtToFt(el.x, el.y, roomLayout);
        return { ...el, svgX: ft.x * SCALE + MARGIN, svgY: ft.y * SCALE + MARGIN };
      })
    : [];

  // ── Grid lines (1 ft intervals) ────────────────────────────────────────────

  const gridV = Array.from({ length: Math.floor(cW) - 1 }, (_, i) => i + 1);
  const gridH = Array.from({ length: Math.floor(cL) - 1 }, (_, i) => i + 1);

  // Rugs under everything; surfaces under stackables so lamps/mirrors paint on top.
  const sorted = [...furniture].sort((a, b) => {
    const rank = (category: string) => {
      if (isFloorCovering(category)) return 0;
      if (isSurface(category)) return 1;
      if (isStackable(category)) return 3;
      return 2;
    };
    return rank(a.category) - rank(b.category);
  });

  return (
    <div
      className="room-layout-canvas animate-reveal w-full"
      style={{ animationDelay: '0.4s' }}
      onMouseLeave={() => {
        setSelectedCategory(null);
        onLinkCategory?.(null);
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-base font-bold flex items-center gap-2">
          <iconify-icon icon="ph:layout-duotone" class="text-[#D3968C]" />
          2D Room Layout
        </h3>
        <span className="text-[10px] text-[#F7F4D5]/40 font-medium">
          Drag to move · top handle rotates · corner handle resizes
        </span>
      </div>

      {/* Floor plan SVG */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${vbW} ${vbH}`}
        className="w-full rounded-xl"
        style={{ maxHeight: '78vh', display: 'block', touchAction: 'none', userSelect: 'none' }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          handlePointerUp();
          setSelectedCategory(null);
          onLinkCategory?.(null);
        }}
        onPointerDown={() => setSelectedCategory(null)}
      >
        <defs>
          <clipPath id="room-interior-clip">
            <path d={roomPathD + cutoutPathD} fillRule="evenodd" />
          </clipPath>
          <mask id="room-wall-mask">
            <rect width={vbW} height={vbH} fill="white" />
            {cutoutPolygons.map((cutout, index) => (
              <path key={index} d={cutout.path} fill="black" stroke="black" strokeWidth={6} />
            ))}
          </mask>
        </defs>

        {/* ── Background ── */}
        <rect width={vbW} height={vbH} fill="transparent" />

        {/* ── Room fill and walls, with true open-sided cutouts ── */}
        <path
          d={roomPathD + cutoutPathD}
          fill="#F7F4D5"
          fillRule="evenodd"
          stroke="none"
        />
        <path
          d={roomPathD}
          fill="none"
          stroke="#0A3323"
          strokeWidth={3}
          strokeLinejoin="round"
          mask="url(#room-wall-mask)"
        />
        {cutoutPolygons.flatMap((cutout, cutoutIndex) =>
          cutout.points.map((point, edgeIndex) => {
            if (edgeIndex === cutout.outsideEdge) return null;
            const next = cutout.points[(edgeIndex + 1) % cutout.points.length];
            return (
              <line
                key={`${cutoutIndex}-${edgeIndex}`}
                x1={point.x}
                y1={point.y}
                x2={next.x}
                y2={next.y}
                stroke="#0A3323"
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
            );
          })
        )}

        {/* ── 1-ft grid lines ── */}
        <g clipPath="url(#room-interior-clip)">
          {gridV.map(i => (
            <line key={`v${i}`}
              x1={i * SCALE + MARGIN} y1={MARGIN}
              x2={i * SCALE + MARGIN} y2={cL * SCALE + MARGIN}
              stroke="rgba(10,51,35,0.07)" strokeWidth={0.8}
            />
          ))}
          {gridH.map(i => (
            <line key={`h${i}`}
              x1={MARGIN} y1={i * SCALE + MARGIN}
              x2={cW * SCALE + MARGIN} y2={i * SCALE + MARGIN}
              stroke="rgba(10,51,35,0.07)" strokeWidth={0.8}
            />
          ))}
        </g>

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
          x={cW * SCALE / 2 + MARGIN}
          y={MARGIN / 2 + 4}
          textAnchor="middle"
          fontSize={11}
          fontWeight="700"
          fill="rgba(247,244,213,0.85)"
          fontFamily="Quicksand, sans-serif"
        >
          {cW % 1 === 0 ? cW : cW.toFixed(1)} ft
        </text>
        <text
          x={MARGIN / 2 - 2}
          y={cL * SCALE / 2 + MARGIN}
          textAnchor="middle"
          fontSize={11}
          fontWeight="700"
          fill="rgba(247,244,213,0.85)"
          fontFamily="Quicksand, sans-serif"
          transform={`rotate(-90, ${MARGIN / 2 - 2}, ${cL * SCALE / 2 + MARGIN})`}
        >
          {cL % 1 === 0 ? cL : cL.toFixed(1)} ft
        </text>

        {/* ── Furniture pieces ── */}
        {sorted.map(item => {
          const pos    = positions[item.category] ?? defaultPos(item.category, room);
          const scale  = scales[item.category] ?? 1;
          const { wFt, dFt } = pieceSizeFt(item, scale);
          const wPx    = wFt * SCALE;
          const dPx    = dFt * SCALE;
          const svgX   = pos.x * SCALE + MARGIN;
          const svgY   = pos.y * SCALE + MARGIN;
          const rot    = rotations[item.category] ?? defaultRotation(item.category);
          const activeCategory = linkedCategory || selectedCategory;
          const isLinked = activeCategory === item.category;
          const showControls = isLinked
            || rotating === item.category
            || resizing === item.category
            || dragging === item.category;
          const isDimmed = Boolean(activeCategory && activeCategory !== item.category
            && rotating !== item.category && resizing !== item.category && dragging !== item.category);
          const isRug    = item.category === 'rug';

          return (
            <g
              key={item.id}
              data-furniture-piece={item.category}
              transform={`translate(${(svgX + wPx / 2).toFixed(1)},${(svgY + dPx / 2).toFixed(1)}) rotate(${rot}) translate(${(-wPx / 2).toFixed(1)},${(-dPx / 2).toFixed(1)})`}
              opacity={isDimmed ? 0.22 : 1}
              style={{
                cursor:     dragging === item.category ? 'grabbing' : 'grab',
                transition: 'opacity 0.2s',
              }}
              onPointerDown={e => handlePointerDown(item.category, e)}
              onContextMenu={e => handleContextMenu(item.category, e)}
              onMouseEnter={() => {
                setSelectedCategory(item.category);
                onLinkCategory?.(item.category);
              }}
            >
              <rect
                x={-10}
                y={-10}
                width={wPx + 20}
                height={dPx + 20}
                rx={10}
                fill="rgba(255,255,255,0)"
                pointerEvents="all"
              />

              {/* Keep rotate/resize reachable — opaque hit bridge through the gap above the piece */}
              {showControls && (
                <rect
                  x={wPx / 2 - 14}
                  y={-36}
                  width={28}
                  height={40}
                  fill="transparent"
                  pointerEvents="all"
                />
              )}

              {/* Highlight ring when linked */}
              {showControls && (
                <>
                  <rect
                    x={-3} y={-3}
                    width={wPx + 6} height={dPx + 6}
                    rx={6}
                    fill="none"
                    stroke="#D3968C"
                    strokeWidth={2.5}
                  />
                  <line
                    x1={wPx / 2}
                    y1={-3}
                    x2={wPx / 2}
                    y2={-18}
                    stroke="#D3968C"
                    strokeWidth={2}
                  />
                  <g
                    role="button"
                    aria-label={`Rotate ${CATEGORY_LABELS[item.category] ?? item.category}`}
                    style={{ cursor: rotating === item.category ? 'grabbing' : 'grab' }}
                    onPointerDown={e => handleRotatePointerDown(item.category, e)}
                  >
                    <circle
                      cx={wPx / 2}
                      cy={-24}
                      r={9}
                      fill="#D3968C"
                      stroke="#F7F4D5"
                      strokeWidth={2}
                    />
                    <path
                      d={`M ${wPx / 2 - 4} -24 A 4 4 0 1 1 ${wPx / 2 + 2} -20`}
                      fill="none"
                      stroke="#F7F4D5"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                    />
                  </g>
                </>
              )}

              <FurnitureIcon item={item} wPx={wPx} dPx={dPx} color={colorByCategory?.[item.category]} />

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

              {/* Remove from floor plan — appears on hover. Counter-rotated so it
                  stays upright and pinned to the top-right corner at any rotation. */}
              {showControls && onRemove && (
                <g
                  transform={`translate(${wPx.toFixed(1)},0) rotate(${-rot})`}
                  style={{ cursor: 'pointer' }}
                  // Remove on pointerdown so the parent's drag handler never starts.
                  onPointerDown={e => {
                    e.stopPropagation();
                    if (e.button !== 0) return;
                    onRemove(item.category);
                  }}
                  onContextMenu={e => { e.stopPropagation(); e.preventDefault(); }}
                >
                  <circle r={8} fill="#D3968C" stroke="#F7F4D5" strokeWidth={1.5} />
                  <path
                    d="M -3 -3 L 3 3 M 3 -3 L -3 3"
                    stroke="#F7F4D5"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                  />
                </g>
              )}

              {/* Bottom-right resize handle. Its distance from the piece center
                  determines scale, preserving the product's aspect ratio. */}
              {showControls && (
                <g
                  role="button"
                  aria-label={`Resize ${CATEGORY_LABELS[item.category] ?? item.category}`}
                  transform={`translate(${wPx.toFixed(1)},${dPx.toFixed(1)})`}
                  style={{ cursor: resizing === item.category ? 'grabbing' : 'nwse-resize' }}
                  onPointerDown={e => handleResizePointerDown(item.category, e)}
                >
                  <circle r={9} fill="#839958" stroke="#F7F4D5" strokeWidth={2} />
                  <path
                    d="M -4 2 L 2 -4 M -1 4 L 4 -1"
                    fill="none"
                    stroke="#F7F4D5"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                  />
                </g>
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
