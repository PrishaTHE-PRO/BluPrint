import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Room, Style, FurnitureItem, RoomLayout , ExistingPlacement } from '../types';
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
  bedArchitectureZones,
  editorPtToFt as editorPtToFtShared,
  findValidFurniturePosition,
  furnitureBounds,
  isBedLikeCategory,
  pieceSizeFt,
  preferredBedPlacement,
  resolveFurniturePlacement,
  type ForbiddenRect,
  type PosFt,
} from '../utils/furnitureConstraints';
import { settlePicturePlacement } from '../utils/picturePlacement';

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
  /** A click (or tap) on a piece that did not turn into a drag. */
  onPick?:          (cat: string) => void;
  onRemove?:        (cat: string) => void;
  /** Restored placement from a saved layout; applied once when it arrives. */
  initialPlacement?: Placement | null;
  /**
   * Positions pushed in after seeding, e.g. the plan being matched to a
   * rendered picture. Applied whenever `key` changes; validated the same way
   * the seed is so nothing lands in a cutout or outside the room.
   */
  applyPlacement?: { key: number; positions: Record<string, PosFt>; centers?: Record<string, PosFt>; rotations?: Record<string, number>; walls?: Record<string, string> } | null;
  /**
   * Furniture already in the user's photo. Drawn as translucent, fixed
   * footprints that cannot be dragged, and treated as occupied floor so
   * recommended pieces are placed around them.
   */
  ghostFurniture?: ExistingPlacement[];
  /** Fires whenever a piece is dragged or rotated, so the parent can save it. */
  onPlacementChange?: (placement: Placement) => void;
  /** Dominant / palette color per furniture category for 2D fills. */
  colorByCategory?: Record<string, string>;
  /** Shown at the right of the "Floor plan" header, e.g. Match plan to picture. */
  headerAction?: ReactNode;
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

/** Exported so the result page falls back to the SAME default the plan uses.
 *  It defaulted to 0 while the plan defaulted to this table, so a sofa (180)
 *  faced backwards in the 3D room and the iso sketch. */
export function defaultRotation(category: string) {
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
  rotations: Record<string, number> = {},
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
      ? {
          position,
          size: pieceSizeFt(anchorItem),
          rotation: rotations[category] ?? defaultRotation(category),
        }
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

    // Bedroom: headboard flush to a wall (see preferredBedPlacement). Fallback
    // here is top-wall centered if the smarter placer is not used.
    case 'bed':
    case 'crib':
      return {
        x: Math.max(inset, (roomWidthFt - wFt) / 2),
        y: inset + Math.min(0.6, roomLengthFt * 0.04),
      };
    case 'nightstand': {
      const bed = anchor('bed');
      if (!bed) return { x: inset, y: inset };
      const rot = ((bed.rotation % 360) + 360) % 360;
      // Sit beside the headboard, not the foot.
      if (rot === 90) {
        // Headboard on right wall.
        return {
          x: bed.position.x + Math.max(0, bed.size.wFt - wFt) * 0.85,
          y: Math.max(inset, bed.position.y - dFt - gap),
        };
      }
      if (rot === 180) {
        return {
          x: Math.max(inset, bed.position.x - wFt - gap),
          y: bed.position.y + Math.max(0, bed.size.dFt - dFt - bed.size.dFt * 0.08),
        };
      }
      if (rot === 270) {
        // Headboard on left wall.
        return {
          x: bed.position.x + Math.max(0, bed.size.wFt * 0.05),
          y: Math.max(inset, bed.position.y - dFt - gap),
        };
      }
      return {
        x: Math.max(inset, bed.position.x - wFt - gap),
        y: bed.position.y + Math.max(0, bed.size.dFt * 0.08),
      };
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
    case 'nursery_rug':
      return centered;
    case 'bath_mat': {
      // A bath mat belongs on the floor you step onto, not floating mid-room.
      // Sit it just inside whichever fixture is actually present.
      const fixture = anchor('bathtub') || anchor('standing_shower') || anchor('vanity');
      if (!fixture) return centered;
      // Step off toward the middle of the room, so a fixture on the bottom wall
      // gets its mat above it rather than pushed outside the room.
      const fixtureMidY = fixture.position.y + fixture.size.dFt / 2;
      const y = fixtureMidY < roomLengthFt / 2
        ? fixture.position.y + fixture.size.dFt + 0.25
        : fixture.position.y - dFt - 0.25;
      return {
        x: fixture.position.x + (fixture.size.wFt - wFt) / 2,
        y: Math.max(inset, Math.min(y, roomLengthFt - dFt - inset)),
      };
    }
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
      // Hangs above the island, so in plan it sits over the island's centre. It
      // used to be pushed a full depth clear, reading as a second object parked
      // beside the island rather than lighting it.
      const island = anchor('island_cart');
      return island
        ? {
            x: island.position.x + (island.size.wFt - wFt) / 2,
            y: island.position.y + (island.size.dFt - dFt) / 2,
          }
        : centered;
    }

    // Large storage and plumbing pieces stay against room edges.
    case 'bookshelf':
    case 'kitchen_storage':
    case 'nursery_dresser':
    case 'bar_cabinet':
      return { x: roomWidthFt - wFt - inset, y: inset };
    // Bath storage used to share the top-right corner with both the tub and the
    // shower — three fixtures on one spot, which the resolver then scattered.
    case 'bath_storage':
      // Right wall, mid-height — clear of the shower above and the tub below.
      return { x: roomWidthFt - wFt - inset, y: (roomLengthFt - dFt) / 2 };
    case 'kitchen_shelf':
    case 'vanity':
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
    // The bathroom set offers vanity, tub, shower and storage at once, and a
    // small bathroom cannot fit a vanity and a tub on the same wall. Give each
    // large fixture its own wall so the collision resolver is not left to
    // scatter three overlapping pieces.
    case 'bathtub':
      // Long fixture: run it along the bottom wall.
      return { x: inset, y: roomLengthFt - dFt - inset };
    case 'standing_shower':
      // Opposite corner from the vanity, on the top wall.
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

export function placedFurnitureZones(
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

/**
 * Furniture on the plan, drawn the way an architect's sheet does it: a plain
 * footprint in a muted tone with the name set small inside. Rugs are a dashed
 * outline so pieces standing on them stay readable; round things (lamps,
 * stools, round tables) are circles; oval tables are pills.
 */
function PlanShape({ item, wPx, dPx, color }: { item: FurnitureItem; wPx: number; dPx: number; color?: string }) {
  const t: FurnitureColorTones = tonesFrom(color, item.category);
  const form = furnitureForm(item.category, item.name);
  const stroke = 'rgba(20, 32, 46, .30)';
  if (isFloorCovering(item.category)) {
    return (
      <rect width={wPx} height={dPx} rx={6}
        fill="rgba(157, 180, 207, .16)" stroke="#9db4cf" strokeWidth={1.5} strokeDasharray="5 4" />
    );
  }
  const round = form === 'round_table'
    || /lamp|light|stool|plant/.test(item.category)
    || (Math.abs(wPx - dPx) < 2 && wPx < 56);
  if (round) {
    return <ellipse cx={wPx / 2} cy={dPx / 2} rx={wPx / 2} ry={dPx / 2} fill={t.base} stroke={stroke} strokeWidth={1.5} />;
  }
  const rx = form === 'oval_table' ? Math.min(wPx, dPx) / 2 : Math.min(10, Math.min(wPx, dPx) / 4);
  return <rect width={wPx} height={dPx} rx={rx} fill={t.base} stroke={stroke} strokeWidth={1.5} />;
}

/** Largest mono size between 7 and 9.5 px at which the label fits the width, or null. */
function fitPlanLabel(text: string, maxPx: number): { text: string; fontSize: number } | null {
  for (let size = 9.5; size >= 7; size -= 0.5) {
    if (text.length * size * 0.62 <= maxPx) return { text, fontSize: size };
  }
  return null;
}

/** 14.5 ft -> 14′ 6″ */
function ftIn(ft: number): string {
  let feet = Math.floor(ft);
  let inches = Math.round((ft - feet) * 12);
  if (inches === 12) { feet += 1; inches = 0; }
  return `${feet}\u2032 ${inches}\u2033`;
}

const PLAN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const PLAN_INK = '#14202e';
const PLAN_DIM = '#5d6b7b';
const PLAN_ROSE = '#d3968c';

// ─── Door & window marks (top-down architectural symbols) ────────────────────

function DoorMark({ sizePx }: { sizePx: number }) {
  // Centered on the snap point; line = wall opening, arc = door swing
  return (
    <g transform={`translate(${-sizePx / 2}, 0)`}>
      {/* wall opening: paints over the wall in the floor colour */}
      <line x1={0} y1={0} x2={sizePx} y2={0} stroke="#fdfcfa" strokeWidth={9} />
      {/* swing arc */}
      <path d={`M ${sizePx} 0 A ${sizePx} ${sizePx} 0 0 1 0 ${sizePx}`}
            fill="none" stroke={PLAN_ROSE} strokeWidth={1.5}
            strokeDasharray="4 3" opacity={0.9} />
      {/* open door leaf */}
      <line x1={0} y1={0} x2={0} y2={sizePx} stroke={PLAN_ROSE} strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

function WindowMark({ sizePx }: { sizePx: number }) {
  return (
    <g transform={`translate(${-sizePx / 2}, -5)`}>
      <rect width={sizePx} height={10} rx={1}
            fill="#f5e5e2" stroke={PLAN_ROSE} strokeWidth={1.5} />
      <line x1={2} y1={5} x2={sizePx - 2} y2={5} stroke={PLAN_ROSE} strokeWidth={1} />
    </g>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RoomSVG({
  room, furniture, roomLayout, linkedCategory, onLinkCategory, onPick, onRemove,
  initialPlacement, applyPlacement, ghostFurniture = [], onPlacementChange, colorByCategory,
  headerAction,
}: Props) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    category: string;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const rotateRef = useRef<{
    category: string;
    center: PosFt;
    pointerStartAngle: number;
    rotationStart: number;
    moved: boolean;
  } | null>(null);
  const seededRef = useRef(false);

  const [positions,  setPositions]  = useState<Record<string, PosFt>>({});
  const [rotations,  setRotations]  = useState<Record<string, number>>({});
  const [scales,     setScales]     = useState<Record<string, number>>({});
  const [dragging,   setDragging]   = useState<string | null>(null);
  const [rotating,   setRotating]   = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [coarsePointer, setCoarsePointer] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const sync = () => setCoarsePointer(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  const handleHitR = coarsePointer ? 16 : 9;
  const dragThresholdFt = coarsePointer ? 0.12 : 0.04;

  // Footprints of the furniture already in the room, in feet. Centred on the
  // position projected from the photo, sized from the category's defaults
  // (the photo gives no measurements), kept inside the room.
  const ghostRects = useMemo(() => {
    const { widthFt, lengthFt } = canvasDimsFt(room, roomLayout);
    return (ghostFurniture || []).map((g) => {
      const { wFt, dFt } = pieceSizeFt({ category: g.category }, 1);
      const w = Math.min(wFt, widthFt);
      const d = Math.min(dFt, lengthFt);
      const x = Math.min(Math.max(0, g.cx - w / 2), Math.max(0, widthFt - w));
      const y = Math.min(Math.max(0, g.cy - d / 2), Math.max(0, lengthFt - d));
      return { ...g, x, y, wFt: w, dFt: d };
    });
  }, [ghostFurniture, room, roomLayout]);
  // The existing pieces as no-go zones, with the same exceptions as placed
  // furniture: a rug runs under the bed that is already there, art hangs
  // above the dresser that is already there, a lamp sits on the nightstand.
  // Treating every ghost as solid for everything pushed the rug out from
  // under the bed and the dresser out of its corner.
  const ghostZonesFor = useCallback((category: string): ForbiddenRect[] => {
    if (isFloorCovering(category)) return [];
    return ghostRects
      .filter((g) => !isFloorCovering(g.category) && !canStackTogether(category, g.category))
      .map((g) => ({ minX: g.x, minY: g.y, maxX: g.x + g.wFt, maxY: g.y + g.dFt }));
  }, [ghostRects]);

  // Seed from a saved layout exactly once — re-validate against room/cutouts
  // so restored placements cannot sit in holes or outside the room.
  useEffect(() => {
    if (seededRef.current || !initialPlacement) return;
    seededRef.current = true;
    const { widthFt, lengthFt } = canvasDimsFt(room, roomLayout);
    const zones = architectureForbiddenZonesFromLayout(roomLayout);
    const bedZones = bedArchitectureZones(roomLayout);
    const nextPositions: Record<string, PosFt> = { ...initialPlacement.positions };
    const nextRotations = { ...initialPlacement.rotations };
    // Everything renders at true product scale; saved per-piece scales are dropped.
    const nextScales: Record<string, number> = {};

    furniture.forEach((item) => {
      const scale = nextScales[item.category] ?? 1;
      const occupied = placedFurnitureZones(nextPositions, furniture, nextRotations, nextScales, item.category);
      let rotation = nextRotations[item.category] ?? defaultRotation(item.category);
      let desired = nextPositions[item.category];

      if (!desired && isBedLikeCategory(item.category)) {
        const placement = preferredBedPlacement(
          item,
          widthFt,
          lengthFt,
          roomLayout,
          [...bedZones, ...occupied],
          scale,
        );
        desired = placement.position;
        if (nextRotations[item.category] === undefined) {
          rotation = placement.rotation;
          nextRotations[item.category] = placement.rotation;
        }
      }

      desired ??= preferredFurniturePosition(
        item,
        nextPositions,
        furniture,
        widthFt,
        lengthFt,
        nextRotations,
      );

      const archZones = isBedLikeCategory(item.category) ? bedZones : zones;
      const resolved = resolveFurniturePlacement(
        desired,
        item,
        rotation,
        widthFt,
        lengthFt,
        [...archZones, ...ghostZonesFor(item.category), ...occupied],
        scale,
      );
      nextPositions[item.category] = resolved.position;
      nextScales[item.category] = 1;
    });

    setPositions(nextPositions);
    setRotations(nextRotations);
    setScales(nextScales);
  }, [initialPlacement, furniture, room, roomLayout, ghostZonesFor]);

  // Apply positions pushed in from outside (the plan matching a render).
  // Unlike the seed this runs every time the key changes, and only for the
  // categories it names, so pieces the render did not locate stay put.
  const appliedKeyRef = useRef<number | null>(null);
  useEffect(() => {
    if (!applyPlacement || applyPlacement.key === appliedKeyRef.current) return;
    appliedKeyRef.current = applyPlacement.key;
    const { widthFt, lengthFt } = canvasDimsFt(room, roomLayout);
    const zones = architectureForbiddenZonesFromLayout(roomLayout);
    const bedZones = bedArchitectureZones(roomLayout);
    setPositions((prevPositions) => {
      const settled = settlePicturePlacement({
        furniture,
        prevPositions,
        rotations,
        placement: applyPlacement,
        widthFt,
        lengthFt,
        zonesFor: (item, positions, nextRotations) => [
          ...(isBedLikeCategory(item.category) ? bedZones : zones),
          ...ghostZonesFor(item.category),
          ...placedFurnitureZones(positions, furniture, nextRotations, {}, item.category),
        ],
        defaultRotation,
      });
      if (applyPlacement.rotations) setRotations(settled.rotations);
      return settled.positions;
    });
  }, [applyPlacement, furniture, room, roomLayout, rotations, ghostZonesFor]);

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
    const rotationUpdates: Record<string, number> = {};

    setPositions((prev) => {
      const next = { ...prev };
      const workingScales = { ...scales };
      const workingRotations = { ...rotations };

      furniture.forEach((item) => {
        const occupiedZones = placedFurnitureZones(
          next,
          furniture,
          workingRotations,
          workingScales,
          item.category,
        );
        const scale = workingScales[item.category] ?? 1;
        let rotation = workingRotations[item.category] ?? defaultRotation(item.category);
        let desired = next[item.category];

        if (!desired && isBedLikeCategory(item.category)) {
          const placement = preferredBedPlacement(
            item,
            cW,
            cL,
            roomLayout,
            [...bedArchitectureZones(roomLayout), ...occupiedZones],
            scale,
          );
          desired = placement.position;
          if (workingRotations[item.category] === undefined) {
            rotation = placement.rotation;
            workingRotations[item.category] = placement.rotation;
            rotationUpdates[item.category] = placement.rotation;
          }
        }

        desired ??= preferredFurniturePosition(
          item,
          next,
          furniture,
          cW,
          cL,
          workingRotations,
        );

        const archZones = isBedLikeCategory(item.category)
          ? bedArchitectureZones(roomLayout)
          : forbiddenZones;
        const resolved = resolveFurniturePlacement(
          desired,
          item,
          rotation,
          cW,
          cL,
          [...archZones, ...occupiedZones],
          scale,
        );
        next[item.category] = resolved.position;
        // resolveFurniturePlacement no longer rescales, so this always matches
        // the scale we passed in — pieces keep their real size.
        workingScales[item.category] = resolved.scale;
      });

      return next;
    });

    if (Object.keys(rotationUpdates).length > 0) {
      setRotations((prev) => ({ ...prev, ...rotationUpdates }));
    }
  }, [furniture, forbiddenZones, room, roomLayout, rotations, scales, cW, cL]);

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

  const applyRotation = useCallback((category: string, nextRotation: number) => {
    const item = furniture.find(f => f.category === category);
    if (!item) return;
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
      startX: clickFt.x,
      startY: clickFt.y,
      moved: false,
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
    const rotationStart = rotations[category] ?? defaultRotation(category);
    rotateRef.current = {
      category,
      center,
      pointerStartAngle: Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180 / Math.PI,
      rotationStart,
      moved: false,
    };
    svgRef.current?.setPointerCapture(e.pointerId);
    setRotating(category);
    setSelectedCategory(category);
    onLinkCategory?.(category);
  }, [furniture, positions, room, rotations, scales, clientToFt, onLinkCategory]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (rotateRef.current || dragRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }

    const rotatingPiece = rotateRef.current;
    if (rotatingPiece) {
      e.preventDefault();
      const pointer = clientToFt(e);
      const pointerAngle = Math.atan2(
        pointer.y - rotatingPiece.center.y,
        pointer.x - rotatingPiece.center.x,
      ) * 180 / Math.PI;
      const nextRotation = rotatingPiece.rotationStart
        + pointerAngle
        - rotatingPiece.pointerStartAngle;
      if (Math.abs(nextRotation - rotatingPiece.rotationStart) > 6) {
        rotatingPiece.moved = true;
      }
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
    const travel = Math.hypot(clickFt.x - drag.startX, clickFt.y - drag.startY);
    if (!drag.moved && travel < dragThresholdFt) return;
    drag.moved = true;
    e.preventDefault();
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
  }, [furniture, rotations, scales, clientToFt, cW, cL, forbiddenZones, dragThresholdFt, positions]);

  const handlePointerUp = useCallback((e?: React.PointerEvent) => {
    const rotatingPiece = rotateRef.current;
    // Tap rotate handle (little/no drag) → snap +90° — reliable on mobile
    if (rotatingPiece && !rotatingPiece.moved) {
      applyRotation(rotatingPiece.category, (rotatingPiece.rotationStart + 90) % 360);
    }
    const draggedPiece = dragRef.current;
    if (draggedPiece && !draggedPiece.moved) onPick?.(draggedPiece.category);

    if (e) {
      e.preventDefault();
      e.stopPropagation();
      if (svgRef.current?.hasPointerCapture?.(e.pointerId)) {
        svgRef.current.releasePointerCapture(e.pointerId);
      }
    }
    dragRef.current = null;
    rotateRef.current = null;
    setDragging(null);
    setRotating(null);
  }, [applyRotation, onPick]);

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
        // Desktop hover clear only — touch selection must stick until tap-away
        if (coarsePointer) return;
        if (dragging || rotating) return;
        setSelectedCategory(null);
        onLinkCategory?.(null);
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1 gap-2">
        <h3 className="text-base font-bold flex items-center gap-2 shrink-0">
          <iconify-icon icon="ph:blueprint" class="text-[#D3968C]" />
          Floor plan
        </h3>
        {headerAction}
      </div>

      {/* Floor plan SVG */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${vbW} ${vbH}`}
        className="w-full rounded-xl room-layout-canvas__svg"
        // Capped so a deep room's portrait plan stays about the height of the
        // picture beside it; the sheet centres itself in the leftover width.
        style={{ maxHeight: 'min(64vh, 620px)', display: 'block', touchAction: 'none', userSelect: 'none' }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerDown={() => {
          setSelectedCategory(null);
          onLinkCategory?.(null);
        }}
      >
        <defs>
          <clipPath id="room-interior-clip">
            <path d={roomPathD + cutoutPathD} fillRule="evenodd" />
          </clipPath>
          <mask id="room-wall-mask">
            <rect width={vbW} height={vbH} fill="white" />
            {cutoutPolygons.map((cutout, index) => (
              <path key={index} d={cutout.path} fill="black" stroke="black" strokeWidth={10} />
            ))}
          </mask>
          <pattern id="plan-paper-grid" width={SCALE / 2} height={SCALE / 2} patternUnits="userSpaceOnUse">
            <path d={`M ${SCALE / 2} 0 L 0 0 0 ${SCALE / 2}`} fill="none" stroke="rgba(41, 79, 125, .06)" strokeWidth={1} />
          </pattern>
        </defs>

        {/* ── Paper ── */}
        <rect width={vbW} height={vbH} rx={14} fill="#f7f9fb" />
        <rect width={vbW} height={vbH} rx={14} fill="url(#plan-paper-grid)" />

        {/* ── Room fill and walls, with true open-sided cutouts ── */}
        <path
          d={roomPathD + cutoutPathD}
          fill="#fdfcfa"
          fillRule="evenodd"
          stroke="none"
        />
        <path
          d={roomPathD}
          fill="none"
          stroke={PLAN_INK}
          strokeWidth={7}
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
                stroke={PLAN_INK}
                strokeWidth={6}
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
              stroke="rgba(41, 79, 125, .09)" strokeWidth={1}
            />
          ))}
          {gridH.map(i => (
            <line key={`h${i}`}
              x1={MARGIN} y1={i * SCALE + MARGIN}
              x2={cW * SCALE + MARGIN} y2={i * SCALE + MARGIN}
              stroke="rgba(41, 79, 125, .09)" strokeWidth={1}
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

        {/* ── Dimension lines ── */}
        {(() => {
          const top = ftIn(cW), left = ftIn(cL);
          const halfTop = top.length * 3.4 + 8, halfLeft = left.length * 3.4 + 8;
          const cx = cW * SCALE / 2 + MARGIN, cy = cL * SCALE / 2 + MARGIN;
          const y = MARGIN / 2, x = MARGIN / 2;
          const common = { fontSize: 11, fontFamily: PLAN_MONO, fill: PLAN_DIM, textAnchor: 'middle' as const, dominantBaseline: 'middle' as const };
          return (
            <g aria-hidden="true">
              <line x1={MARGIN} y1={y} x2={cx - halfTop} y2={y} stroke={PLAN_DIM} strokeWidth={1} opacity={0.45} />
              <line x1={cx + halfTop} y1={y} x2={cW * SCALE + MARGIN} y2={y} stroke={PLAN_DIM} strokeWidth={1} opacity={0.45} />
              <text x={cx} y={y} {...common}>{top}</text>
              <line x1={x} y1={MARGIN} x2={x} y2={cy - halfLeft} stroke={PLAN_DIM} strokeWidth={1} opacity={0.45} />
              <line x1={x} y1={cy + halfLeft} x2={x} y2={cL * SCALE + MARGIN} stroke={PLAN_DIM} strokeWidth={1} opacity={0.45} />
              <text x={x} y={cy} {...common} transform={`rotate(-90, ${x}, ${cy})`}>{left}</text>
            </g>
          );
        })()}

        {/* ── Furniture already in the room: fixed, translucent, not draggable ── */}
        {ghostRects.length > 0 && (
          <g className="ghost-furniture" pointerEvents="none" aria-hidden="true">
            {ghostRects.map((g, i) => {
              const wPx = g.wFt * SCALE;
              const dPx = g.dFt * SCALE;
              const x = g.x * SCALE + MARGIN;
              const y = g.y * SCALE + MARGIN;
              const rot = g.rotation ?? 0;
              return (
                <g
                  key={`ghost-${i}-${g.label}`}
                  transform={`translate(${(x + wPx / 2).toFixed(1)},${(y + dPx / 2).toFixed(1)}) rotate(${rot}) translate(${(-wPx / 2).toFixed(1)},${(-dPx / 2).toFixed(1)})`}
                  opacity={0.42}
                >
                  <rect
                    width={wPx}
                    height={dPx}
                    rx={6}
                    fill="rgba(122, 112, 96, 0.28)"
                    stroke="rgba(122, 112, 96, 0.9)"
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                  />
                  <text
                    x={wPx / 2}
                    y={dPx / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.max(8, Math.min(11, wPx / 8))}
                    fontWeight="700"
                    fontFamily="Quicksand, sans-serif"
                    fill="rgba(60, 52, 44, 0.95)"
                  >
                    {g.label}
                  </text>
                </g>
              );
            })}
          </g>
        )}

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
            || dragging === item.category;
          const isDimmed = Boolean(activeCategory && activeCategory !== item.category
            && rotating !== item.category && dragging !== item.category);
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
                touchAction: 'none',
              }}
              onPointerDown={e => handlePointerDown(item.category, e)}
              onContextMenu={e => handleContextMenu(item.category, e)}
              onMouseEnter={() => {
                if (coarsePointer) return;
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
                  x={wPx / 2 - (handleHitR + 6)}
                  y={-(handleHitR * 2 + 20)}
                  width={(handleHitR + 6) * 2}
                  height={handleHitR * 2 + 24}
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
                    y2={-(handleHitR + 9)}
                    stroke="#D3968C"
                    strokeWidth={2}
                  />
                  <g
                    role="button"
                    aria-label={`Rotate ${CATEGORY_LABELS[item.category] ?? item.category}`}
                    style={{ cursor: rotating === item.category ? 'grabbing' : 'grab', touchAction: 'none' }}
                    onPointerDown={e => handleRotatePointerDown(item.category, e)}
                  >
                    {/* Invisible larger hit target for fingers */}
                    <circle
                      cx={wPx / 2}
                      cy={-(handleHitR + 15)}
                      r={handleHitR + 6}
                      fill="transparent"
                    />
                    <circle
                      cx={wPx / 2}
                      cy={-(handleHitR + 15)}
                      r={handleHitR}
                      fill="#D3968C"
                      stroke="#F7F4D5"
                      strokeWidth={2}
                    />
                    <path
                      d={`M ${wPx / 2 - handleHitR * 0.45} ${-(handleHitR + 15)} A ${handleHitR * 0.45} ${handleHitR * 0.45} 0 1 1 ${wPx / 2 + handleHitR * 0.22} ${-(handleHitR + 15) + handleHitR * 0.45}`}
                      fill="none"
                      stroke="#F7F4D5"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                    />
                  </g>
                </>
              )}

              <PlanShape item={item} wPx={wPx} dPx={dPx} color={colorByCategory?.[item.category]} />

              {/* Name, set small and upright in the footprint whatever the piece's
                  rotation. Rugs stay unlabelled; a name that cannot fit is left off. */}
              {!isRug && (() => {
                const turned = Math.abs(((rot % 180) + 180) % 180 - 90) < 45;
                const availW = (turned ? dPx : wPx) - 8;
                const availH = turned ? wPx : dPx;
                if (availW < 24 || availH < 16) return null;
                const label = fitPlanLabel((CATEGORY_LABELS[item.category] ?? item.category).toUpperCase(), availW);
                if (!label) return null;
                return (
                  <text
                    x={wPx / 2}
                    y={dPx / 2}
                    transform={`rotate(${-rot}, ${wPx / 2}, ${dPx / 2})`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={label.fontSize}
                    fontWeight="500"
                    letterSpacing=".06em"
                    fill={PLAN_INK}
                    opacity={0.7}
                    fontFamily={PLAN_MONO}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {label.text}
                  </text>
                );
              })()}

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

            </g>
          );
        })}
      </svg>

      {/* Sheet legend */}
      <div className="room-layout-canvas__legend" aria-hidden="true">
        <span><i className="room-layout-canvas__legend-door" />Door</span>
        <span><i className="room-layout-canvas__legend-window" />Window</span>
        <span><i className="room-layout-canvas__legend-sq" />1 sq = 1 ft</span>
      </div>
    </div>
  );
}
