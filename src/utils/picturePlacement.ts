import type { FurnitureItem } from '../types';
import {
  clampFurniturePosition,
  overlapsForbiddenZone,
  pieceSizeFt,
  resolveFurniturePlacement,
  type ForbiddenRect,
  type PosFt,
} from './furnitureConstraints';

export interface PicturePlacement {
  positions: Record<string, PosFt>;
  rotations?: Record<string, number>;
  /** The wall each piece stands against in the picture, when it does. */
  walls?: Record<string, string>;
}

/**
 * The nearest clear spot along the wall a piece stands against, up to a few
 * feet either way, or null when there is none. The coordinate across the
 * wall is left as the picture had it, so the piece stays flush.
 */
export function slideAlongWall(
  position: PosFt,
  item: FurnitureItem,
  rotation: number,
  wall: string,
  widthFt: number,
  lengthFt: number,
  zones: ForbiddenRect[],
): PosFt | null {
  const alongX = wall === 'back wall' || wall === 'front wall';
  const step = 0.2;
  for (let offset = step; offset <= 8; offset += step) {
    for (const sign of [1, -1]) {
      const candidate = alongX
        ? { x: position.x + sign * offset, y: position.y }
        : { x: position.x, y: position.y + sign * offset };
      const clamped = clampFurniturePosition(candidate, item, rotation, widthFt, lengthFt, 1);
      // Clamping may have pulled it back onto the same spot; skip those.
      if (Math.abs((alongX ? clamped.x : clamped.y) - (alongX ? position.x : position.y)) < step / 2) continue;
      if (!overlapsForbiddenZone(clamped, item, rotation, zones, 1)) return clamped;
    }
  }
  return null;
}

/**
 * Applies positions read off the picture to the plan.
 *
 * Every pushed piece takes its picture position first. Validating one at a
 * time against the others' OLD spots moved pieces away from things that
 * were themselves about to move: the dresser ended up a foot off its wall
 * because the plant had not left its old corner yet. Clashes are then
 * settled biggest piece first, so a bed or dresser holds its spot and the
 * lamp or plant moves around it. A piece the picture shows against a wall
 * stays on that wall and slides along it, rather than stepping into the
 * room, which is where the free-spot search tends to send it.
 */
export function settlePicturePlacement(args: {
  furniture: FurnitureItem[];
  prevPositions: Record<string, PosFt>;
  rotations: Record<string, number>;
  placement: PicturePlacement;
  widthFt: number;
  lengthFt: number;
  /** Everything the piece must stay clear of, given where the others are now. */
  zonesFor: (item: FurnitureItem, positions: Record<string, PosFt>, rotations: Record<string, number>) => ForbiddenRect[];
  defaultRotation: (category: string) => number;
}): { positions: Record<string, PosFt>; rotations: Record<string, number> } {
  const { furniture, prevPositions, placement, widthFt, lengthFt, zonesFor } = args;
  const positions: Record<string, PosFt> = { ...prevPositions };
  const rotations = { ...args.rotations, ...(placement.rotations || {}) };

  const pushed = furniture.filter((item) => placement.positions[item.category]);
  for (const item of pushed) positions[item.category] = placement.positions[item.category];

  const area = (item: FurnitureItem) => { const { wFt, dFt } = pieceSizeFt(item, 1); return wFt * dFt; };
  for (const item of [...pushed].sort((a, b) => area(b) - area(a))) {
    const rotation = rotations[item.category] ?? args.defaultRotation(item.category);
    const zones = zonesFor(item, positions, rotations);
    const wanted = clampFurniturePosition(positions[item.category], item, rotation, widthFt, lengthFt, 1);
    if (!overlapsForbiddenZone(wanted, item, rotation, zones, 1)) {
      positions[item.category] = wanted;
      continue;
    }
    const wall = placement.walls?.[item.category];
    const slid = wall ? slideAlongWall(wanted, item, rotation, wall, widthFt, lengthFt, zones) : null;
    positions[item.category] = slid
      ?? resolveFurniturePlacement(wanted, item, rotation, widthFt, lengthFt, zones, 1).position;
  }
  return { positions, rotations };
}
