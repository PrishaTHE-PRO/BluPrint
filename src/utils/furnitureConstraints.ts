import type { FurnitureItem, RoomLayout, RoomPoint } from '../types';

/** Position in feet from the room's top-left origin */
export type PosFt = { x: number; y: number };

export type ForbiddenRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const EDITOR_SCALE = 20; // architecture editor: 20 SVG px = 1 ft
const ZONE_PADDING = 0.25;
const DOOR_SIZE_FT = 2.67;

/** Floor dims in feet from editor polygon points (matches RoomSVG / iso cutouts). */
export function roomDimsFromPoints(roomPoints?: RoomPoint[] | null): { widthFt: number; lengthFt: number } | null {
  if (!roomPoints || roomPoints.length < 2) return null;
  const xs = roomPoints.map((p) => p.x);
  const ys = roomPoints.map((p) => p.y);
  return {
    widthFt: Math.max((Math.max(...xs) - Math.min(...xs)) / EDITOR_SCALE, 1),
    lengthFt: Math.max((Math.max(...ys) - Math.min(...ys)) / EDITOR_SCALE, 1),
  };
}

const DEFAULT_WIDTH_IN: Record<string, number> = {
  sofa: 84, accent_chair: 32, coffee_table: 48, rug: 96, floor_lamp: 12, side_table: 18,
  bed: 60, nightstand: 20, dresser: 48, bedroom_rug: 96, wardrobe: 36, bedside_lamp: 10,
  bar_stool: 16, pendant_light: 12, kitchen_rug: 24, kitchen_storage: 30, island_cart: 48, kitchen_shelf: 36,
  vanity: 36, bath_mirror: 24, bath_storage: 20, bath_mat: 20, bath_light: 24, shower_curtain: 60,
  bathtub: 60, standing_shower: 36,
  desk: 60, office_chair: 24, bookshelf: 36, desk_lamp: 10, storage_cabinet: 24, monitor_stand: 24,
  dining_table: 60, dining_chair: 18, dining_rug: 96, sideboard: 54, dining_light: 18, bar_cabinet: 36,
  crib: 52, nursery_dresser: 36, rocking_chair: 28, nursery_rug: 72, nursery_shelf: 30, nursery_lamp: 10,
  reading_nook: 34, smart_lighting: 12, floating_shelves: 36, indoor_plants: 18,
  full_length_mirror: 24, wall_art: 36, workspace_desk: 48, vanity_station: 42, bookcase: 36,
};

const DEFAULT_DEPTH_IN: Record<string, number> = {
  sofa: 36, accent_chair: 32, coffee_table: 24, rug: 72, floor_lamp: 12, side_table: 18,
  bed: 80, nightstand: 16, dresser: 18, bedroom_rug: 72, wardrobe: 24, bedside_lamp: 10,
  bar_stool: 16, pendant_light: 12, kitchen_rug: 60, kitchen_storage: 14, island_cart: 24, kitchen_shelf: 12,
  vanity: 21, bath_mirror: 4, bath_storage: 12, bath_mat: 30, bath_light: 8, shower_curtain: 3,
  bathtub: 30, standing_shower: 36,
  desk: 30, office_chair: 24, bookshelf: 14, desk_lamp: 10, storage_cabinet: 18, monitor_stand: 12,
  dining_table: 36, dining_chair: 18, dining_rug: 72, sideboard: 18, dining_light: 18, bar_cabinet: 18,
  crib: 28, nursery_dresser: 18, rocking_chair: 30, nursery_rug: 60, nursery_shelf: 12, nursery_lamp: 10,
  reading_nook: 34, smart_lighting: 12, floating_shelves: 10, indoor_plants: 18,
  full_length_mirror: 6, wall_art: 4, workspace_desk: 24, vanity_station: 20, bookcase: 14,
};

export function pieceSizeFt(
  item: Pick<FurnitureItem, 'category' | 'widthIn' | 'depthIn'> | {
    category: string;
    widthIn?: number;
    depthIn?: number;
  },
  scale = 1,
) {
  const safeScale = Math.max(0.5, Math.min(2, scale));
  return {
    wFt: ((item.widthIn ?? DEFAULT_WIDTH_IN[item.category] ?? 36) / 12) * safeScale,
    dFt: ((item.depthIn ?? DEFAULT_DEPTH_IN[item.category] ?? 30) / 12) * safeScale,
  };
}

function editorOrigin(roomPoints: RoomPoint[]) {
  return {
    minX: Math.min(...roomPoints.map((p) => p.x)),
    minY: Math.min(...roomPoints.map((p) => p.y)),
  };
}

export function editorPtToFt(px: number, py: number, roomPoints: RoomPoint[]) {
  const { minX, minY } = editorOrigin(roomPoints);
  return {
    x: (px - minX) / EDITOR_SCALE,
    y: (py - minY) / EDITOR_SCALE,
  };
}

export function clampFurniturePosition(
  position: PosFt,
  item: Pick<FurnitureItem, 'category' | 'widthIn' | 'depthIn'> | {
    category: string;
    widthIn?: number;
    depthIn?: number;
  },
  rotation: number,
  roomWidthFt: number,
  roomLengthFt: number,
  scale = 1,
): PosFt {
  const { wFt, dFt } = pieceSizeFt(item, scale);
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

export function furnitureBounds(
  position: PosFt,
  item: Pick<FurnitureItem, 'category' | 'widthIn' | 'depthIn'> | {
    category: string;
    widthIn?: number;
    depthIn?: number;
  },
  rotation: number,
  scale = 1,
): ForbiddenRect {
  const { wFt, dFt } = pieceSizeFt(item, scale);
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

export function overlapsForbiddenZone(
  position: PosFt,
  item: Pick<FurnitureItem, 'category' | 'widthIn' | 'depthIn'> | {
    category: string;
    widthIn?: number;
    depthIn?: number;
  },
  rotation: number,
  zones: ForbiddenRect[],
  scale = 1,
) {
  const bounds = furnitureBounds(position, item, rotation, scale);
  const clearance = 0.2;
  return zones.some((zone) =>
    bounds.maxX > zone.minX - clearance
    && bounds.minX < zone.maxX + clearance
    && bounds.maxY > zone.minY - clearance
    && bounds.minY < zone.maxY + clearance);
}

/** Push a colliding piece away from the center of each overlapping keep-out. */
function nudgeAwayFromZones(
  position: PosFt,
  item: Pick<FurnitureItem, 'category' | 'widthIn' | 'depthIn'> | {
    category: string;
    widthIn?: number;
    depthIn?: number;
  },
  rotation: number,
  zones: ForbiddenRect[],
  scale = 1,
): PosFt {
  let next = { ...position };
  for (let iter = 0; iter < 12; iter += 1) {
    if (!overlapsForbiddenZone(next, item, rotation, zones, scale)) return next;
    const bounds = furnitureBounds(next, item, rotation, scale);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    let pushed = false;
    for (const zone of zones) {
      const hits = bounds.maxX > zone.minX
        && bounds.minX < zone.maxX
        && bounds.maxY > zone.minY
        && bounds.minY < zone.maxY;
      if (!hits) continue;
      const zx = (zone.minX + zone.maxX) / 2;
      const zy = (zone.minY + zone.maxY) / 2;
      let dx = cx - zx;
      let dy = cy - zy;
      const len = Math.hypot(dx, dy);
      if (len < 0.05) {
        // Dead center of a zone — prefer the larger free axis.
        dx = (zone.maxX - zone.minX) <= (zone.maxY - zone.minY) ? 1 : 0;
        dy = dx === 0 ? 1 : 0;
      } else {
        dx /= len;
        dy /= len;
      }
      next = { x: next.x + dx * 0.4, y: next.y + dy * 0.4 };
      pushed = true;
    }
    if (!pushed) break;
  }
  return next;
}

export function findValidFurniturePosition(
  desired: PosFt,
  item: Pick<FurnitureItem, 'category' | 'widthIn' | 'depthIn'> | {
    category: string;
    widthIn?: number;
    depthIn?: number;
  },
  rotation: number,
  roomWidthFt: number,
  roomLengthFt: number,
  zones: ForbiddenRect[],
  scale = 1,
): PosFt {
  const nudged = nudgeAwayFromZones(desired, item, rotation, zones, scale);
  const base = clampFurniturePosition(nudged, item, rotation, roomWidthFt, roomLengthFt, scale);
  if (!overlapsForbiddenZone(base, item, rotation, zones, scale)) return base;

  const step = 0.2;
  const maxRadius = Math.max(roomWidthFt, roomLengthFt) + 2;
  for (let radius = step; radius <= maxRadius; radius += step) {
    for (let offset = -radius; offset <= radius; offset += step) {
      const candidates = [
        { x: base.x + offset, y: base.y - radius },
        { x: base.x + offset, y: base.y + radius },
        { x: base.x - radius, y: base.y + offset },
        { x: base.x + radius, y: base.y + offset },
      ];
      for (const candidate of candidates) {
        const clamped = clampFurniturePosition(candidate, item, rotation, roomWidthFt, roomLengthFt, scale);
        if (!overlapsForbiddenZone(clamped, item, rotation, zones, scale)) return clamped;
      }
    }
  }

  // Full-room scan — catches spots the spiral misses for large rugs.
  for (let y = 0; y <= roomLengthFt; y += step) {
    for (let x = 0; x <= roomWidthFt; x += step) {
      const clamped = clampFurniturePosition({ x, y }, item, rotation, roomWidthFt, roomLengthFt, scale);
      if (!overlapsForbiddenZone(clamped, item, rotation, zones, scale)) return clamped;
    }
  }

  return base;
}

/**
 * Find a cutout-safe placement, shrinking oversized pieces (rugs especially)
 * when the room hole leaves too little floor for the full footprint.
 */
export function resolveFurniturePlacement(
  desired: PosFt,
  item: Pick<FurnitureItem, 'category' | 'widthIn' | 'depthIn'> | {
    category: string;
    widthIn?: number;
    depthIn?: number;
  },
  rotation: number,
  roomWidthFt: number,
  roomLengthFt: number,
  zones: ForbiddenRect[],
  scale = 1,
): { position: PosFt; scale: number } {
  // Never shrink. Furniture is drawn at the real product dimensions, so making a
  // piece smaller to squeeze it past a cutout made the plan lie about whether it
  // actually fits — and it read as the piece randomly "glitching" smaller. A
  // piece that cannot fit is placed at the best position the search can find and
  // left at full size; the overlap is the honest answer.
  //
  // This also removes a hidden cost: the old loop ran the placement search up to
  // 15 times per call, and that search is the expensive one on a blocked drag.
  const position = findValidFurniturePosition(
    desired,
    item,
    rotation,
    roomWidthFt,
    roomLengthFt,
    zones,
    scale,
  );
  return { position, scale };
}

/** Cutout + door AABBs in feet (same basis as RoomSVG / iso preview). */
export function architectureForbiddenZones(input: {
  roomPoints?: RoomPoint[] | null;
  cutouts?: Array<{ points?: RoomPoint[] | null }> | null;
  doors?: Array<{ x: number; y: number; angle?: number }> | null;
  padding?: number;
}): ForbiddenRect[] {
  const roomPoints = input.roomPoints ?? [];
  if (roomPoints.length < 2) return [];

  const padding = input.padding ?? ZONE_PADDING;
  const cutoutZones = (input.cutouts ?? [])
    .filter((cutout) => Array.isArray(cutout.points) && (cutout.points?.length ?? 0) >= 3)
    .map((cutout) => {
      const points = (cutout.points as RoomPoint[]).map((point) =>
        editorPtToFt(point.x, point.y, roomPoints));
      return {
        minX: Math.min(...points.map((point) => point.x)) - padding,
        maxX: Math.max(...points.map((point) => point.x)) + padding,
        minY: Math.min(...points.map((point) => point.y)) - padding,
        maxY: Math.max(...points.map((point) => point.y)) + padding,
      };
    });

  const doorZones = (input.doors ?? []).map((element) => {
    const anchor = editorPtToFt(element.x, element.y, roomPoints);
    const radians = ((element.angle ?? 0) * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const corners = [
      { x: -DOOR_SIZE_FT / 2, y: 0 },
      { x: DOOR_SIZE_FT / 2, y: 0 },
      { x: -DOOR_SIZE_FT / 2, y: DOOR_SIZE_FT },
      { x: DOOR_SIZE_FT / 2, y: DOOR_SIZE_FT },
    ].map((point) => ({
      x: anchor.x + point.x * cos - point.y * sin,
      y: anchor.y + point.x * sin + point.y * cos,
    }));
    return {
      minX: Math.min(...corners.map((point) => point.x)) - padding,
      maxX: Math.max(...corners.map((point) => point.x)) + padding,
      minY: Math.min(...corners.map((point) => point.y)) - padding,
      maxY: Math.max(...corners.map((point) => point.y)) + padding,
    };
  });

  return [...cutoutZones, ...doorZones];
}

export function architectureForbiddenZonesFromLayout(layout: RoomLayout | null | undefined): ForbiddenRect[] {
  if (!layout) return [];
  return architectureForbiddenZones({
    roomPoints: layout.roomPoints,
    cutouts: layout.cutouts,
    doors: layout.elements.filter((el) => el.type === 'door'),
  });
}

const WINDOW_SIZE_FT = 3.5;
const BED_WALL_INSET = 0.2;
type BedWall = 'top' | 'right' | 'bottom' | 'left';

const BED_WALL_ROTATION: Record<BedWall, number> = {
  // Matches SVG rotate + isoPartOps: headboard at local y≈0.
  top: 0,
  right: 90,
  bottom: 180,
  left: 270,
};

type WallOpening = {
  kind: 'door' | 'window';
  /** Distance along the wall from the wall's start corner (ft). */
  along: number;
  halfWidth: number;
};

function classifyOpeningWall(
  x: number,
  y: number,
  roomWidthFt: number,
  roomLengthFt: number,
): BedWall {
  const distTop = y;
  const distBottom = roomLengthFt - y;
  const distLeft = x;
  const distRight = roomWidthFt - x;
  const nearest = Math.min(distTop, distBottom, distLeft, distRight);
  if (nearest === distTop) return 'top';
  if (nearest === distBottom) return 'bottom';
  if (nearest === distLeft) return 'left';
  return 'right';
}

function openingsAlongWalls(
  layout: RoomLayout | null | undefined,
  roomWidthFt: number,
  roomLengthFt: number,
): Record<BedWall, WallOpening[]> {
  const empty: Record<BedWall, WallOpening[]> = {
    top: [], right: [], bottom: [], left: [],
  };
  if (!layout?.roomPoints?.length) return empty;

  for (const el of layout.elements ?? []) {
    if (el.type !== 'door' && el.type !== 'window') continue;
    const ft = editorPtToFt(el.x, el.y, layout.roomPoints);
    const wall = classifyOpeningWall(ft.x, ft.y, roomWidthFt, roomLengthFt);
    const halfWidth = el.type === 'door'
      ? DOOR_SIZE_FT / 2 + 0.75
      : ((el.width ?? WINDOW_SIZE_FT * EDITOR_SCALE) / EDITOR_SCALE) / 2 + 0.35;
    const along = wall === 'top' || wall === 'bottom' ? ft.x : ft.y;
    empty[wall].push({ kind: el.type, along, halfWidth });
  }
  return empty;
}

function headboardInterval(
  wall: BedWall,
  position: PosFt,
  item: Pick<FurnitureItem, 'category' | 'widthIn' | 'depthIn'>,
  rotation: number,
  scale: number,
): { start: number; end: number } | null {
  const bounds = furnitureBounds(position, item, rotation, scale);
  if (wall === 'top' || wall === 'bottom') {
    return { start: bounds.minX, end: bounds.maxX };
  }
  return { start: bounds.minY, end: bounds.maxY };
}

function intervalOverlapsOpening(
  start: number,
  end: number,
  opening: WallOpening,
  clearance = 0.35,
): boolean {
  const o0 = opening.along - opening.halfWidth - clearance;
  const o1 = opening.along + opening.halfWidth + clearance;
  return end > o0 && start < o1;
}

function bedPositionOnWall(
  wall: BedWall,
  alongCenter: number,
  item: Pick<FurnitureItem, 'category' | 'widthIn' | 'depthIn'>,
  roomWidthFt: number,
  roomLengthFt: number,
  scale: number,
): { position: PosFt; rotation: number } {
  const rotation = BED_WALL_ROTATION[wall];
  const { wFt, dFt } = pieceSizeFt(item, scale);
  const radians = (rotation * Math.PI) / 180;
  const occupiedWidth = Math.abs(wFt * Math.cos(radians)) + Math.abs(dFt * Math.sin(radians));
  const occupiedDepth = Math.abs(wFt * Math.sin(radians)) + Math.abs(dFt * Math.cos(radians));
  const inset = BED_WALL_INSET;

  let centerX = roomWidthFt / 2;
  let centerY = roomLengthFt / 2;

  if (wall === 'top') {
    centerY = inset + occupiedDepth / 2;
    centerX = Math.max(occupiedWidth / 2 + inset, Math.min(roomWidthFt - occupiedWidth / 2 - inset, alongCenter));
  } else if (wall === 'bottom') {
    centerY = roomLengthFt - inset - occupiedDepth / 2;
    centerX = Math.max(occupiedWidth / 2 + inset, Math.min(roomWidthFt - occupiedWidth / 2 - inset, alongCenter));
  } else if (wall === 'left') {
    centerX = inset + occupiedWidth / 2;
    centerY = Math.max(occupiedDepth / 2 + inset, Math.min(roomLengthFt - occupiedDepth / 2 - inset, alongCenter));
  } else {
    centerX = roomWidthFt - inset - occupiedWidth / 2;
    centerY = Math.max(occupiedDepth / 2 + inset, Math.min(roomLengthFt - occupiedDepth / 2 - inset, alongCenter));
  }

  return {
    rotation,
    position: { x: centerX - wFt / 2, y: centerY - dFt / 2 },
  };
}

/**
 * Place a bed/crib with the headboard flush to a wall, never blocking a door,
 * and preferring walls without windows along the headboard.
 */
export function preferredBedPlacement(
  item: Pick<FurnitureItem, 'category' | 'widthIn' | 'depthIn'>,
  roomWidthFt: number,
  roomLengthFt: number,
  layout: RoomLayout | null | undefined,
  zones: ForbiddenRect[] = [],
  scale = 1,
): { position: PosFt; rotation: number } {
  const openings = openingsAlongWalls(layout, roomWidthFt, roomLengthFt);
  const walls: BedWall[] = ['top', 'bottom', 'left', 'right'];
  const { wFt } = pieceSizeFt(item, scale);
  const headboardSpan = Math.max(wFt, pieceSizeFt(item, scale).dFt * 0.35);

  type Candidate = { position: PosFt; rotation: number; score: number };
  const candidates: Candidate[] = [];

  for (const wall of walls) {
    const wallLen = wall === 'top' || wall === 'bottom' ? roomWidthFt : roomLengthFt;
    const alongCenters = [
      wallLen / 2,
      wallLen * 0.35,
      wallLen * 0.65,
      wallLen * 0.25,
      wallLen * 0.75,
    ];

    // Also try midpoints of clear spans between openings.
    const wallOpenings = [...openings[wall]].sort((a, b) => a.along - b.along);
    let cursor = 1.5;
    for (const opening of wallOpenings) {
      const gapEnd = opening.along - opening.halfWidth - 0.5;
      if (gapEnd - cursor > headboardSpan) {
        alongCenters.push((cursor + gapEnd) / 2);
      }
      cursor = opening.along + opening.halfWidth + 0.5;
    }
    if (wallLen - 1.5 - cursor > headboardSpan) {
      alongCenters.push((cursor + wallLen - 1.5) / 2);
    }

    for (const along of alongCenters) {
      const placed = bedPositionOnWall(wall, along, item, roomWidthFt, roomLengthFt, scale);
      const clamped = clampFurniturePosition(
        placed.position,
        item,
        placed.rotation,
        roomWidthFt,
        roomLengthFt,
        scale,
      );
      if (overlapsForbiddenZone(clamped, item, placed.rotation, zones, scale)) continue;

      const head = headboardInterval(wall, clamped, item, placed.rotation, scale);
      if (!head) continue;

      let score = 100;
      // Prefer longer walls slightly (more centering room).
      score += Math.min(wallLen, 20) * 0.4;
      // Prefer centering on the wall.
      score -= Math.abs(along - wallLen / 2) * 0.8;

      let blockedByDoor = false;
      for (const opening of wallOpenings) {
        if (!intervalOverlapsOpening(head.start, head.end, opening)) continue;
        if (opening.kind === 'door') {
          blockedByDoor = true;
          break;
        }
        // Soft penalty — try not to cover a window with the headboard.
        score -= 55;
      }
      if (blockedByDoor) continue;

      // Prefer top/back wall slightly for conventional bedroom layouts.
      if (wall === 'top') score += 8;
      if (wall === 'bottom') score += 4;

      candidates.push({ position: clamped, rotation: placed.rotation, score });
    }
  }

  if (candidates.length === 0) {
    // Fallback: top wall, centered — still headboard-against-wall.
    return bedPositionOnWall('top', roomWidthFt / 2, item, roomWidthFt, roomLengthFt, scale);
  }

  candidates.sort((a, b) => b.score - a.score);
  return { position: candidates[0].position, rotation: candidates[0].rotation };
}

/** Extra keep-outs for beds: doors get wider clearance so the headboard never sits in an opening. */
export function bedArchitectureZones(layout: RoomLayout | null | undefined): ForbiddenRect[] {
  if (!layout?.roomPoints?.length) return architectureForbiddenZonesFromLayout(layout);
  return architectureForbiddenZones({
    roomPoints: layout.roomPoints,
    cutouts: layout.cutouts,
    doors: layout.elements.filter((el) => el.type === 'door'),
    padding: 0.55,
  });
}

export function isBedLikeCategory(category: string): boolean {
  return category === 'bed' || category === 'crib';
}

/** Push every piece inside the room and out of cutouts/doors. */
export function constrainFurnitureEntries<T extends {
  category: string;
  x: number;
  y: number;
  rotation?: number;
  scale?: number;
  item?: { widthIn?: number; depthIn?: number; name?: string; color?: string } | null;
}>(
  entries: T[],
  roomWidthFt: number,
  roomLengthFt: number,
  zones: ForbiddenRect[],
): T[] {
  if (!entries.length) return entries;
  const W = Math.max(roomWidthFt, 1);
  const L = Math.max(roomLengthFt, 1);

  return entries.map((entry) => {
    const item = {
      category: entry.category,
      widthIn: entry.item?.widthIn,
      depthIn: entry.item?.depthIn,
    };
    const rotation = entry.rotation ?? 0;
    const scale = entry.scale ?? 1;
    const desired = { x: entry.x, y: entry.y };

    if (zones.length === 0) {
      const clamped = clampFurniturePosition(desired, item, rotation, W, L, scale);
      if (clamped.x === entry.x && clamped.y === entry.y) return entry;
      return { ...entry, x: clamped.x, y: clamped.y };
    }

    // Always re-resolve when overlapping a cutout/door — shrink rugs if needed.
    if (!overlapsForbiddenZone(desired, item, rotation, zones, scale)) {
      return entry;
    }

    const resolved = resolveFurniturePlacement(desired, item, rotation, W, L, zones, scale);
    return {
      ...entry,
      x: resolved.position.x,
      y: resolved.position.y,
      scale: resolved.scale,
    };
  });
}
