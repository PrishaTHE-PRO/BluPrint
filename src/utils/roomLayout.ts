import type {
  ArchitectureCutout,
  ArchitectureElement,
  Room,
  RoomArchitectureLayout,
  RoomPoint,
} from '../types';

export const ROOM_LAYOUT_STORAGE_KEY = 'blueprintRoomLayout';
export const ROOM_LAYOUT_VERSION = 1;
export const ROOM_LAYOUT_VIEWBOX = { width: 800, height: 500 };
export const ROOM_LAYOUT_SCALE = 20;

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePoint(value: unknown): RoomPoint {
  if (!value || typeof value !== 'object') {
    return { x: 0, y: 0 };
  }

  const point = value as { x?: unknown; y?: unknown };
  return {
    x: toNumber(point.x),
    y: toNumber(point.y),
  };
}

function normalizeElement(value: unknown): ArchitectureElement {
  if (!value || typeof value !== 'object') {
    return { id: '', type: 'door', x: 0, y: 0, angle: 0 };
  }

  const element = value as {
    id?: unknown;
    type?: unknown;
    x?: unknown;
    y?: unknown;
    angle?: unknown;
  };

  return {
    id: element.id ?? '',
    type: element.type === 'window' ? 'window' : 'door',
    x: toNumber(element.x),
    y: toNumber(element.y),
    angle: toNumber(element.angle),
  };
}

function normalizeCutout(value: unknown): ArchitectureCutout {
  if (!value || typeof value !== 'object') {
    return { id: '', type: 'cutout', points: [] };
  }

  const cutout = value as {
    id?: unknown;
    points?: unknown;
  };

  return {
    id: cutout.id ?? '',
    type: 'cutout',
    points: Array.isArray(cutout.points) ? cutout.points.map(normalizePoint) : [],
  };
}

export function getRoomDimensionsFromPoints(points: RoomPoint[], scale = ROOM_LAYOUT_SCALE) {
  if (points.length < 3) {
    return { widthFt: 0, lengthFt: 0 };
  }

  const p1 = points[0];
  const p2 = points[1];
  const p3 = points[2];

  return {
    widthFt: Math.hypot(p2.x - p1.x, p2.y - p1.y) / scale,
    lengthFt: Math.hypot(p3.x - p2.x, p3.y - p2.y) / scale,
  };
}

export function calculatePolygonArea(points: RoomPoint[]) {
  if (points.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

export function calculateCutoutAreaSqFt(cutouts: ArchitectureCutout[], scale = ROOM_LAYOUT_SCALE) {
  return cutouts.reduce((sum, cutout) => sum + calculatePolygonArea(cutout.points) / (scale * scale), 0);
}

export function createCenteredRoomPoints(
  widthFt: number,
  lengthFt: number,
  viewBox = ROOM_LAYOUT_VIEWBOX,
  scale = ROOM_LAYOUT_SCALE,
): RoomPoint[] {
  const safeWidthFt = Math.max(widthFt, 1);
  const safeLengthFt = Math.max(lengthFt, 1);
  const maxWidthScale = (viewBox.width - 160) / safeWidthFt;
  const maxLengthScale = (viewBox.height - 120) / safeLengthFt;
  const derivedScale = Math.min(scale, maxWidthScale, maxLengthScale);
  const safeScale = Number.isFinite(derivedScale) && derivedScale > 0 ? derivedScale : scale;

  const roomWidth = safeWidthFt * safeScale;
  const roomLength = safeLengthFt * safeScale;
  const centerX = viewBox.width / 2;
  const centerY = viewBox.height / 2;

  return [
    { x: centerX - roomWidth / 2, y: centerY - roomLength / 2 },
    { x: centerX + roomWidth / 2, y: centerY - roomLength / 2 },
    { x: centerX + roomWidth / 2, y: centerY + roomLength / 2 },
    { x: centerX - roomWidth / 2, y: centerY + roomLength / 2 },
  ];
}

export function createFallbackRoomLayout(room: Room): RoomArchitectureLayout {
  return {
    version: ROOM_LAYOUT_VERSION,
    roomId: room.roomId === 'fallback' ? undefined : room.roomId,
    roomName: room.name,
    widthFt: room.widthFt,
    lengthFt: room.lengthFt,
    heightFt: room.heightFt,
    sqft: room.sqft,
    scale: ROOM_LAYOUT_SCALE,
    viewBox: { ...ROOM_LAYOUT_VIEWBOX },
    roomPoints: createCenteredRoomPoints(room.widthFt, room.lengthFt),
    elements: [],
    cutouts: [],
    savedAt: new Date().toISOString(),
  };
}

export function buildRoomFromLayout(layout: RoomArchitectureLayout | null, fallbackRoom: Room): Room {
  if (!layout) return fallbackRoom;

  return {
    roomId: layout.roomId ?? fallbackRoom.roomId,
    name: layout.roomName,
    widthFt: layout.widthFt,
    lengthFt: layout.lengthFt,
    heightFt: layout.heightFt,
    sqft: layout.sqft,
  };
}

export function readSavedRoomLayout(): RoomArchitectureLayout | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(ROOM_LAYOUT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<RoomArchitectureLayout> & {
      roomPoints?: unknown;
      elements?: unknown;
      cutouts?: unknown;
    };

    if (!Array.isArray(parsed.roomPoints) || !Array.isArray(parsed.elements) || !Array.isArray(parsed.cutouts)) {
      return null;
    }

    return {
      version: typeof parsed.version === 'number' ? parsed.version : ROOM_LAYOUT_VERSION,
      roomId: typeof parsed.roomId === 'string' ? parsed.roomId : undefined,
      roomName: typeof parsed.roomName === 'string' && parsed.roomName.trim() ? parsed.roomName : 'My Room',
      widthFt: toNumber(parsed.widthFt),
      lengthFt: toNumber(parsed.lengthFt),
      heightFt: toNumber(parsed.heightFt),
      sqft: toNumber(parsed.sqft),
      scale: toNumber(parsed.scale, ROOM_LAYOUT_SCALE) > 0 ? toNumber(parsed.scale, ROOM_LAYOUT_SCALE) : ROOM_LAYOUT_SCALE,
      viewBox: {
        width: toNumber(parsed.viewBox?.width, ROOM_LAYOUT_VIEWBOX.width) > 0
          ? toNumber(parsed.viewBox?.width, ROOM_LAYOUT_VIEWBOX.width)
          : ROOM_LAYOUT_VIEWBOX.width,
        height: toNumber(parsed.viewBox?.height, ROOM_LAYOUT_VIEWBOX.height) > 0
          ? toNumber(parsed.viewBox?.height, ROOM_LAYOUT_VIEWBOX.height)
          : ROOM_LAYOUT_VIEWBOX.height,
      },
      roomPoints: parsed.roomPoints.map(normalizePoint),
      elements: parsed.elements.map(normalizeElement),
      cutouts: parsed.cutouts.map(normalizeCutout),
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveRoomLayout(layout: RoomArchitectureLayout): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ROOM_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}
