import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import type { Room, Style, FurnitureItem, RoomLayout } from '../types';
import { CATEGORY_LABELS, isFloorCovering } from '../utils/furnitureLayout';

// ─── Constants ──────────────────────────────────────────────────────────────

/** SVG pixels per foot in the floor-plan canvas */
const SCALE = 40;

/** Margin around the room polygon for dimension labels */
const MARGIN = 32;

/** Default furniture widths (inches) when the API doesn't supply them */
const DEFAULT_WIDTH_IN: Record<string, number> = {
  // Living room
  sofa:            84, accent_chair: 32, coffee_table: 48,
  rug:             96, floor_lamp:   12, side_table:   18,
  // Bedroom
  bed:             60, nightstand:   20, dresser:      48,
  bedroom_rug:     96, wardrobe:     36, bedside_lamp: 10,
  // Kitchen
  bar_stool:       16, pendant_light: 12, kitchen_rug:  24,
  kitchen_storage: 30, island_cart:  48, kitchen_shelf: 36,
  // Bathroom
  vanity:          36, bath_mirror:  24, bath_storage: 20,
  bath_mat:        20, bath_light:   24, shower_curtain: 72,
  // Home office
  desk:            60, office_chair: 24, bookshelf:    36,
  desk_lamp:       10, storage_cabinet: 24, monitor_stand: 24,
  // Dining room
  dining_table:    60, dining_chair: 18, dining_rug:   96,
  sideboard:       54, dining_light: 18, bar_cabinet:  36,
  // Nursery
  crib:            52, nursery_dresser: 36, rocking_chair: 28,
  nursery_rug:     72, nursery_shelf: 30, nursery_lamp: 10,
  // User-selected room features
  reading_nook: 34, smart_lighting: 12, floating_shelves: 36,
  indoor_plants: 18, full_length_mirror: 24, wall_art: 36,
  workspace_desk: 48, vanity_station: 42, bookcase: 36,
};

/** Default furniture depths (inches) when the API doesn't supply them */
const DEFAULT_DEPTH_IN: Record<string, number> = {
  // Living room
  sofa:            36, accent_chair: 32, coffee_table: 24,
  rug:             72, floor_lamp:   12, side_table:   18,
  // Bedroom
  bed:             80, nightstand:   16, dresser:      18,
  bedroom_rug:     72, wardrobe:     24, bedside_lamp: 10,
  // Kitchen
  bar_stool:       16, pendant_light: 12, kitchen_rug:  60,
  kitchen_storage: 14, island_cart:  24, kitchen_shelf: 12,
  // Bathroom
  vanity:          21, bath_mirror:   4, bath_storage: 12,
  bath_mat:        30, bath_light:    8, shower_curtain: 72,
  // Home office
  desk:            30, office_chair: 24, bookshelf:    14,
  desk_lamp:       10, storage_cabinet: 18, monitor_stand: 12,
  // Dining room
  dining_table:    36, dining_chair: 18, dining_rug:   72,
  sideboard:       18, dining_light: 18, bar_cabinet:  18,
  // Nursery
  crib:            28, nursery_dresser: 18, rocking_chair: 30,
  nursery_rug:     60, nursery_shelf: 12, nursery_lamp: 10,
  // User-selected room features
  reading_nook: 34, smart_lighting: 12, floating_shelves: 10,
  indoor_plants: 18, full_length_mirror: 6, wall_art: 4,
  workspace_desk: 24, vanity_station: 20, bookcase: 14,
};

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
  bed:             { xf: 0.22, yf: 0.22 },
  nightstand:      { xf: 0.06, yf: 0.22 },
  dresser:         { xf: 0.62, yf: 0.08 },
  bedroom_rug:     { xf: 0.18, yf: 0.52 },
  wardrobe:        { xf: 0.62, yf: 0.60 },
  bedside_lamp:    { xf: 0.06, yf: 0.12 },
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
  shower_curtain:  { xf: 0.40, yf: 0.08 },
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
}

export interface Placement {
  positions: Record<string, PosFt>;
  rotations: Record<string, number>;
}

/** Position in feet from the room's top-left origin */
export interface PosFt { x: number; y: number }
interface ForbiddenRect { minX: number; minY: number; maxX: number; maxY: number }

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
    case 'accent_chair': {
      const table = anchor('coffee_table');
      return table
        ? { x: table.position.x + table.size.wFt + 1, y: table.position.y + (table.size.dFt - dFt) / 2 }
        : { x: roomWidthFt - wFt - inset, y: centered.y };
    }
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

    // Bedroom: headboard on a clear wall and storage around the perimeter.
    case 'bed':
      return { x: centered.x, y: inset };
    case 'nightstand': {
      const bed = anchor('bed');
      return bed
        ? { x: bed.position.x - wFt - gap, y: bed.position.y }
        : { x: inset, y: inset };
    }
    case 'bedside_lamp': {
      const nightstand = anchor('nightstand');
      return nightstand
        ? {
            x: nightstand.position.x + (nightstand.size.wFt - wFt) / 2,
            y: nightstand.position.y + nightstand.size.dFt + gap,
          }
        : { x: inset, y: inset };
    }
    case 'bedroom_rug': {
      const bed = anchor('bed');
      return bed
        ? { x: bed.position.x + (bed.size.wFt - wFt) / 2, y: bed.position.y + bed.size.dFt * 0.45 }
        : centered;
    }
    case 'dresser':
      return { x: roomWidthFt - wFt - inset, y: inset };
    case 'wardrobe':
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
        ? { x: desk.position.x + (desk.size.wFt - wFt) / 2, y: desk.position.y + desk.size.dFt + gap }
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
    case 'bath_mirror':
    case 'bath_light':
    case 'vanity':
    case 'crib':
      return { x: inset, y: inset };
    case 'storage_cabinet':
    case 'sideboard':
    case 'nursery_shelf':
      return { x: roomWidthFt - wFt - inset, y: roomLengthFt - dFt - inset };
    case 'rocking_chair':
    case 'nursery_lamp':
    case 'reading_nook':
    case 'indoor_plants':
      return { x: inset, y: roomLengthFt - dFt - inset };
    case 'shower_curtain':
      return { x: centered.x, y: inset };
    case 'dining_light': {
      const table = anchor('dining_table');
      return table
        ? { x: table.position.x + (table.size.wFt - wFt) / 2, y: table.position.y - dFt - gap }
        : centered;
    }
    case 'smart_lighting':
      return { x: roomWidthFt - wFt - inset, y: roomLengthFt - dFt - inset };
    case 'floating_shelves':
    case 'full_length_mirror':
    case 'wall_art':
    case 'workspace_desk':
    case 'vanity_station':
    case 'bookcase':
      return { x: roomWidthFt - wFt - inset, y: inset };
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

function clampFurniturePosition(
  position: PosFt,
  item: FurnitureItem,
  rotation: number,
  roomWidthFt: number,
  roomLengthFt: number,
): PosFt {
  const { wFt, dFt } = pieceSizeFt(item);
  const radians = (rotation * Math.PI) / 180;
  const occupiedWidth = Math.abs(wFt * Math.cos(radians)) + Math.abs(dFt * Math.sin(radians));
  const occupiedDepth = Math.abs(wFt * Math.sin(radians)) + Math.abs(dFt * Math.cos(radians));
  const desiredCenterX = position.x + wFt / 2;
  const desiredCenterY = position.y + dFt / 2;
  const centerX = occupiedWidth >= roomWidthFt
    ? roomWidthFt / 2
    : Math.max(occupiedWidth / 2, Math.min(roomWidthFt - occupiedWidth / 2, desiredCenterX));
  const centerY = occupiedDepth >= roomLengthFt
    ? roomLengthFt / 2
    : Math.max(occupiedDepth / 2, Math.min(roomLengthFt - occupiedDepth / 2, desiredCenterY));

  return {
    x: centerX - wFt / 2,
    y: centerY - dFt / 2,
  };
}

function furnitureBounds(position: PosFt, item: FurnitureItem, rotation: number): ForbiddenRect {
  const { wFt, dFt } = pieceSizeFt(item);
  const radians = (rotation * Math.PI) / 180;
  const occupiedWidth = Math.abs(wFt * Math.cos(radians)) + Math.abs(dFt * Math.sin(radians));
  const occupiedDepth = Math.abs(wFt * Math.sin(radians)) + Math.abs(dFt * Math.cos(radians));
  const centerX = position.x + wFt / 2;
  const centerY = position.y + dFt / 2;
  return {
    minX: centerX - occupiedWidth / 2,
    maxX: centerX + occupiedWidth / 2,
    minY: centerY - occupiedDepth / 2,
    maxY: centerY + occupiedDepth / 2,
  };
}

function placedFurnitureZones(
  positions: Record<string, PosFt>,
  furniture: FurnitureItem[],
  rotations: Record<string, number>,
  excludedCategory: string,
): ForbiddenRect[] {
  if (isFloorCovering(excludedCategory)) return [];
  return furniture
    .filter(item =>
      item.category !== excludedCategory
      && !isFloorCovering(item.category)
      && positions[item.category]
    )
    .map(item => furnitureBounds(
      positions[item.category],
      item,
      rotations[item.category] ?? 0,
    ));
}

function overlapsForbiddenZone(
  position: PosFt,
  item: FurnitureItem,
  rotation: number,
  zones: ForbiddenRect[],
) {
  const bounds = furnitureBounds(position, item, rotation);
  const clearance = 0.1;
  return zones.some(zone =>
    bounds.maxX > zone.minX - clearance
    && bounds.minX < zone.maxX + clearance
    && bounds.maxY > zone.minY - clearance
    && bounds.minY < zone.maxY + clearance
  );
}

function findValidFurniturePosition(
  desired: PosFt,
  item: FurnitureItem,
  rotation: number,
  roomWidthFt: number,
  roomLengthFt: number,
  zones: ForbiddenRect[],
): PosFt {
  const base = clampFurniturePosition(desired, item, rotation, roomWidthFt, roomLengthFt);
  if (!overlapsForbiddenZone(base, item, rotation, zones)) return base;

  const step = 0.25;
  const maxRadius = Math.max(roomWidthFt, roomLengthFt);
  for (let radius = step; radius <= maxRadius; radius += step) {
    for (let offset = -radius; offset <= radius; offset += step) {
      const candidates = [
        { x: base.x + offset, y: base.y - radius },
        { x: base.x + offset, y: base.y + radius },
        { x: base.x - radius, y: base.y + offset },
        { x: base.x + radius, y: base.y + offset },
      ];
      for (const candidate of candidates) {
        const clamped = clampFurniturePosition(candidate, item, rotation, roomWidthFt, roomLengthFt);
        if (!overlapsForbiddenZone(clamped, item, rotation, zones)) return clamped;
      }
    }
  }
  return base;
}

/**
 * Convert a point in the architecture editor's SVG space to feet,
 * measured from the room polygon's own top-left corner.
 *
 * The editor uses 20 SVG px per foot. We derive the room origin from
 * the bounding box of the actual polygon — this works correctly for
 * rectangular rooms, custom polygons, and any drag-resized layout.
 */
function editorPtToFt(px: number, py: number, layout: RoomLayout) {
  const ES   = 20; // editor: 20 SVG px = 1 ft (constant regardless of shape)
  const minX = Math.min(...layout.roomPoints.map(p => p.x));
  const minY = Math.min(...layout.roomPoints.map(p => p.y));
  return {
    x: (px - minX) / ES,
    y: (py - minY) / ES,
  };
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

// ── Bedroom icons ─────────────────────────────────────────────────────────────

function BedIcon({ w, d }: { w: number; d: number }) {
  const headH  = Math.max(6, d * 0.18);   // headboard band
  const pilW   = w * 0.28;
  const pilH   = Math.max(5, d * 0.16);
  const pilY   = headH + Math.max(3, d * 0.05);
  const pilGap = (w - pilW * 2) / 3;
  return (
    <g>
      {/* mattress */}
      <rect width={w} height={d} rx={3} fill="#EDE8D8" stroke="#0A3323" strokeWidth={1.5} />
      {/* headboard */}
      <rect width={w} height={headH} rx={2} fill="#C4B896" stroke="#0A3323" strokeWidth={1} />
      {/* left pillow */}
      <rect x={pilGap} y={pilY} width={pilW} height={pilH} rx={3}
            fill="#F7F4D5" stroke="#0A3323" strokeWidth={0.8} opacity={0.9} />
      {/* right pillow */}
      <rect x={pilGap * 2 + pilW} y={pilY} width={pilW} height={pilH} rx={3}
            fill="#F7F4D5" stroke="#0A3323" strokeWidth={0.8} opacity={0.9} />
    </g>
  );
}

function NightstandIcon({ w, d }: { w: number; d: number }) {
  const mg = Math.max(3, Math.min(w, d) * 0.15);
  return (
    <g>
      <rect width={w} height={d} rx={3} fill="#D4C49A" stroke="#0A3323" strokeWidth={1.5} />
      {/* drawer line */}
      <line x1={mg} y1={d / 2} x2={w - mg} y2={d / 2} stroke="#0A3323" strokeWidth={0.8} opacity={0.5} />
      {/* knob */}
      <circle cx={w / 2} cy={d / 2} r={2} fill="#0A3323" opacity={0.4} />
    </g>
  );
}

function DresserIcon({ w, d }: { w: number; d: number }) {
  const drawers = Math.max(2, Math.round(w / 30));  // ~1 drawer per 30px
  const gap     = Math.max(2, w * 0.03);
  const dw      = (w - gap * (drawers + 1)) / drawers;
  return (
    <g>
      <rect width={w} height={d} rx={3} fill="#C8BA9A" stroke="#0A3323" strokeWidth={1.5} />
      {Array.from({ length: drawers }, (_, i) => (
        <g key={i}>
          <rect
            x={gap + i * (dw + gap)} y={d * 0.12}
            width={dw} height={d * 0.76}
            rx={2} fill="#D8CDB0" stroke="#0A3323" strokeWidth={0.8}
          />
          <circle cx={gap + i * (dw + gap) + dw / 2} cy={d / 2} r={2} fill="#0A3323" opacity={0.4} />
        </g>
      ))}
    </g>
  );
}

function WardrobeIcon({ w, d }: { w: number; d: number }) {
  const mid = w / 2;
  return (
    <g>
      <rect width={w} height={d} rx={3} fill="#C8BA9A" stroke="#0A3323" strokeWidth={1.5} />
      {/* center divider = two door gap */}
      <line x1={mid} y1={0} x2={mid} y2={d} stroke="#0A3323" strokeWidth={1} opacity={0.5} />
      {/* door handles */}
      <circle cx={mid - 6} cy={d / 2} r={2} fill="#0A3323" opacity={0.4} />
      <circle cx={mid + 6} cy={d / 2} r={2} fill="#0A3323" opacity={0.4} />
    </g>
  );
}

// ── Other room type icons ──────────────────────────────────────────────────────

function DeskIcon({ w, d }: { w: number; d: number }) {
  const surface = d * 0.55;
  return (
    <g>
      <rect width={w} height={d} rx={3} fill="#D4C49A" stroke="#0A3323" strokeWidth={1.5} />
      {/* desktop surface line */}
      <line x1={0} y1={surface} x2={w} y2={surface} stroke="#0A3323" strokeWidth={0.7} opacity={0.4} />
    </g>
  );
}

function DiningTableIcon({ w, d }: { w: number; d: number }) {
  const mg = Math.max(3, Math.min(w, d) * 0.1);
  return (
    <g>
      <rect width={w} height={d} rx={5} fill="#D4C49A" stroke="#0A3323" strokeWidth={1.5} />
      <rect x={mg} y={mg} width={w - mg * 2} height={d - mg * 2} rx={3}
            fill="none" stroke="#0A3323" strokeWidth={0.7} opacity={0.4} />
    </g>
  );
}

function ShelfIcon({ w, d }: { w: number; d: number }) {
  return (
    <g>
      <rect width={w} height={d} rx={2} fill="#C8BA9A" stroke="#0A3323" strokeWidth={1.5} />
      {/* shelf dividers */}
      {[0.33, 0.66].map(frac => (
        <line key={frac} x1={w * frac} y1={0} x2={w * frac} y2={d}
              stroke="#0A3323" strokeWidth={0.7} opacity={0.4} />
      ))}
    </g>
  );
}

function CribIcon({ w, d }: { w: number; d: number }) {
  const slats = Math.max(3, Math.round(w / 14));
  const gap   = w / (slats + 1);
  return (
    <g>
      <rect width={w} height={d} rx={4} fill="#EDE8D8" stroke="#0A3323" strokeWidth={1.5} />
      {/* slats */}
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

function LampIcon({ w, d }: { w: number; d: number }) {
  return <FloorLampIcon w={w} d={d} />;
}

// ── Icon router ───────────────────────────────────────────────────────────────

function FurnitureIcon({ item, wPx, dPx }: { item: FurnitureItem; wPx: number; dPx: number }) {
  switch (item.category) {
    // Living room
    case 'sofa':            return <SofaIcon w={wPx} d={dPx} />;
    case 'accent_chair':    return <ChairIcon w={wPx} d={dPx} />;
    case 'coffee_table':    return <CoffeeTableIcon w={wPx} d={dPx} />;
    case 'rug':             return <RugIcon w={wPx} d={dPx} />;
    case 'floor_lamp':      return <FloorLampIcon w={wPx} d={dPx} />;
    case 'side_table':      return <SideTableIcon w={wPx} d={dPx} />;
    // Bedroom
    case 'bed':             return <BedIcon w={wPx} d={dPx} />;
    case 'nightstand':      return <NightstandIcon w={wPx} d={dPx} />;
    case 'dresser':         return <DresserIcon w={wPx} d={dPx} />;
    case 'bedroom_rug':     return <RugIcon w={wPx} d={dPx} />;
    case 'wardrobe':        return <WardrobeIcon w={wPx} d={dPx} />;
    case 'bedside_lamp':    return <LampIcon w={wPx} d={dPx} />;
    // Kitchen
    case 'bar_stool':       return <ChairIcon w={wPx} d={dPx} />;
    case 'island_cart':     return <DiningTableIcon w={wPx} d={dPx} />;
    case 'kitchen_shelf':   return <ShelfIcon w={wPx} d={dPx} />;
    case 'kitchen_storage': return <DresserIcon w={wPx} d={dPx} />;
    case 'pendant_light':   return <FloorLampIcon w={wPx} d={dPx} />;
    case 'kitchen_rug':     return <RugIcon w={wPx} d={dPx} />;
    // Dining room
    case 'dining_table':    return <DiningTableIcon w={wPx} d={dPx} />;
    case 'dining_chair':    return <ChairIcon w={wPx} d={dPx} />;
    case 'dining_rug':      return <RugIcon w={wPx} d={dPx} />;
    case 'sideboard':       return <DresserIcon w={wPx} d={dPx} />;
    case 'dining_light':    return <FloorLampIcon w={wPx} d={dPx} />;
    case 'bar_cabinet':     return <WardrobeIcon w={wPx} d={dPx} />;
    // Home office
    case 'desk':            return <DeskIcon w={wPx} d={dPx} />;
    case 'office_chair':    return <ChairIcon w={wPx} d={dPx} />;
    case 'bookshelf':       return <ShelfIcon w={wPx} d={dPx} />;
    case 'desk_lamp':       return <LampIcon w={wPx} d={dPx} />;
    case 'storage_cabinet': return <WardrobeIcon w={wPx} d={dPx} />;
    case 'monitor_stand':   return <CoffeeTableIcon w={wPx} d={dPx} />;
    // Nursery
    case 'crib':            return <CribIcon w={wPx} d={dPx} />;
    case 'nursery_dresser': return <DresserIcon w={wPx} d={dPx} />;
    case 'rocking_chair':   return <ChairIcon w={wPx} d={dPx} />;
    case 'nursery_rug':     return <RugIcon w={wPx} d={dPx} />;
    case 'nursery_shelf':   return <ShelfIcon w={wPx} d={dPx} />;
    case 'nursery_lamp':    return <LampIcon w={wPx} d={dPx} />;
    // Bathroom
    case 'vanity':          return <DresserIcon w={wPx} d={dPx} />;
    case 'bath_mirror':     return <CoffeeTableIcon w={wPx} d={dPx} />;
    case 'bath_storage':    return <ShelfIcon w={wPx} d={dPx} />;
    case 'bath_mat':        return <RugIcon w={wPx} d={dPx} />;
    case 'bath_light':      return <LampIcon w={wPx} d={dPx} />;
    case 'shower_curtain':  return <RugIcon w={wPx} d={dPx} />;
    // User-selected room features
    case 'reading_nook':       return <ChairIcon w={wPx} d={dPx} />;
    case 'smart_lighting':     return <LampIcon w={wPx} d={dPx} />;
    case 'floating_shelves':   return <ShelfIcon w={wPx} d={dPx} />;
    case 'indoor_plants':      return <FloorLampIcon w={wPx} d={dPx} />;
    case 'full_length_mirror': return <CoffeeTableIcon w={wPx} d={dPx} />;
    case 'workspace_desk':     return <DeskIcon w={wPx} d={dPx} />;
    case 'vanity_station':     return <DresserIcon w={wPx} d={dPx} />;
    case 'bookcase':           return <ShelfIcon w={wPx} d={dPx} />;
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
  initialPlacement, onPlacementChange,
}: Props) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ category: string; offsetX: number; offsetY: number } | null>(null);
  const rotateRef = useRef<{
    category: string;
    center: PosFt;
    pointerStartAngle: number;
    rotationStart: number;
  } | null>(null);
  const seededRef = useRef(false);

  const [positions,  setPositions]  = useState<Record<string, PosFt>>({});
  const [rotations,  setRotations]  = useState<Record<string, number>>({});
  const [dragging,   setDragging]   = useState<string | null>(null);
  const [rotating,   setRotating]   = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Seed from a saved layout exactly once — it may arrive after the first render.
  useEffect(() => {
    if (seededRef.current || !initialPlacement) return;
    seededRef.current = true;
    setPositions(initialPlacement.positions);
    setRotations(initialPlacement.rotations);
  }, [initialPlacement]);

  // Report placement upward so Save Layout can capture it.
  useEffect(() => {
    onPlacementChange?.({ positions, rotations });
  }, [positions, rotations, onPlacementChange]);

  // Canvas dimensions — driven by the actual polygon bounding box when available
  // so the viewport, grid, labels, and drag clamping all agree.
  const { widthFt: cW, lengthFt: cL } = canvasDimsFt(room, roomLayout);
  const forbiddenZones = useMemo<ForbiddenRect[]>(() => {
    if (!roomLayout) return [];
    const padding = 0.15;
    const cutoutZones = roomLayout.cutouts
      .filter(cutout => cutout.points.length >= 3)
      .map(cutout => {
        const points = cutout.points.map(point => editorPtToFt(point.x, point.y, roomLayout));
        return {
          minX: Math.min(...points.map(point => point.x)) - padding,
          maxX: Math.max(...points.map(point => point.x)) + padding,
          minY: Math.min(...points.map(point => point.y)) - padding,
          maxY: Math.max(...points.map(point => point.y)) + padding,
        };
      });
    const doorSizeFt = 2.67;
    const doorZones = roomLayout.elements
      .filter(element => element.type === 'door')
      .map(element => {
        const anchor = editorPtToFt(element.x, element.y, roomLayout);
        const radians = (element.angle * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const corners = [
          { x: -doorSizeFt / 2, y: 0 },
          { x: doorSizeFt / 2, y: 0 },
          { x: -doorSizeFt / 2, y: doorSizeFt },
          { x: doorSizeFt / 2, y: doorSizeFt },
        ].map(point => ({
          x: anchor.x + point.x * cos - point.y * sin,
          y: anchor.y + point.x * sin + point.y * cos,
        }));
        return {
          minX: Math.min(...corners.map(point => point.x)) - padding,
          maxX: Math.max(...corners.map(point => point.x)) + padding,
          minY: Math.min(...corners.map(point => point.y)) - padding,
          maxY: Math.max(...corners.map(point => point.y)) + padding,
        };
      });
    return [...cutoutZones, ...doorZones];
  }, [roomLayout]);

  // Initialise default positions when furniture changes
  useEffect(() => {
    setPositions(prev => {
      const next = { ...prev };
      furniture.forEach(item => {
        const occupiedZones = placedFurnitureZones(next, furniture, rotations, item.category);
        const rotation = rotations[item.category] ?? defaultRotation(item.category);
        next[item.category] = findValidFurniturePosition(
          next[item.category] ?? preferredFurniturePosition(item, next, furniture, cW, cL),
          item,
          rotation,
          cW,
          cL,
          [...forbiddenZones, ...occupiedZones],
        );
      });
      return next;
    });
  }, [furniture, forbiddenZones, room, rotations, cW, cL]);

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
    const { wFt, dFt } = pieceSizeFt(item);
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
  }, [furniture, positions, room, rotations, clientToFt, onLinkCategory]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
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
      setRotations(prev => ({ ...prev, [rotatingPiece.category]: nextRotation }));
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const clickFt = clientToFt(e);
    const item    = furniture.find(f => f.category === drag.category);
    if (!item) return;
    const rotation = rotations[drag.category] ?? defaultRotation(drag.category);
    setPositions(prev => {
      const occupiedZones = placedFurnitureZones(prev, furniture, rotations, drag.category);
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
      ),
      };
    });
  }, [furniture, rotations, clientToFt, cW, cL, forbiddenZones]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    rotateRef.current = null;
    setDragging(null);
    setRotating(null);
  }, []);

  const handleContextMenu = useCallback((category: string, e: React.MouseEvent) => {
    e.preventDefault();
    const item = furniture.find(f => f.category === category);
    if (!item) return;
    const nextRotation = ((rotations[category] ?? defaultRotation(category)) + 90) % 360;
    setRotations(prev => ({ ...prev, [category]: nextRotation }));
    setPositions(prev => {
      const occupiedZones = placedFurnitureZones(prev, furniture, rotations, category);
      return {
        ...prev,
        [category]: findValidFurniturePosition(
        prev[category] ?? defaultPos(category, room),
        item,
        nextRotation,
        cW,
        cL,
        [...forbiddenZones, ...occupiedZones],
      ),
      };
    });
  }, [furniture, rotations, room, cW, cL, forbiddenZones]);

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

  // ── Sorted furniture (rug renders first / underneath) ─────────────────────

  const sorted = [...furniture].sort((a, b) => {
    const aRug = isFloorCovering(a.category) ? -1 : 0;
    const bRug = isFloorCovering(b.category) ? -1 : 0;
    return aRug - bRug;
  });

  return (
    <div
      className="room-layout-canvas animate-reveal w-full"
      style={{ animationDelay: '0.4s' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-base font-bold flex items-center gap-2">
          <iconify-icon icon="ph:layout-duotone" class="text-[#D3968C]" />
          2D Room Layout
        </h3>
        <span className="text-[10px] text-[#F7F4D5]/40 font-medium">
          Drag to move · hold the rotate handle · ✕ to remove
        </span>
      </div>

      {/* Floor plan SVG */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${vbW} ${vbH}`}
        className="w-full rounded-xl"
        style={{ maxHeight: '78vh', display: 'block' }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
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
          const { wFt, dFt } = pieceSizeFt(item);
          const wPx    = wFt * SCALE;
          const dPx    = dFt * SCALE;
          const svgX   = pos.x * SCALE + MARGIN;
          const svgY   = pos.y * SCALE + MARGIN;
          const rot    = rotations[item.category] ?? defaultRotation(item.category);
          const activeCategory = linkedCategory || selectedCategory;
          const isLinked = activeCategory === item.category;
          const isDimmed = Boolean(activeCategory && activeCategory !== item.category);
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
              onMouseLeave={() => onLinkCategory?.(null)}
            >
              {/* Highlight ring when linked */}
              {isLinked && (
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

              {/* Remove from floor plan — appears on hover. Counter-rotated so it
                  stays upright and pinned to the top-right corner at any rotation. */}
              {isLinked && onRemove && (
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
