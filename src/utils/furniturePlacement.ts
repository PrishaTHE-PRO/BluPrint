import type { FurnitureItem } from '../types';

export const FURNITURE_PLACEMENT_STORAGE_KEY = 'blueprintFurniturePlacement';
export const FURNITURE_PLACEMENT_VERSION = 2;

/** Position in feet from the room's top-left origin — matches RoomSVG's PosFt. */
export interface PlacementPos { x: number; y: number }

export interface PlacedFurniture {
  category: string;
  /** Removed from the floor plan but still listed in the sidebar. */
  hidden:   boolean;
  x:        number;
  y:        number;
  rotation: number;
  scale:    number;
  /** Sampled / matched product color used in 2D + 3D previews. */
  color?:   string;
  /**
   * The full chosen product, not just its id. Furniture ids from the search API
   * are positional (`sofa-0`, `sofa-1`, ...) and point at whatever ranks there
   * today, so storing an id would silently restore a different product later.
   */
  item:     FurnitureItem;
}

export interface FurniturePlacement {
  version: number;
  /** Scopes a locally-cached placement so it can't leak into a different room. */
  roomId?: string;
  /**
   * The style this layout was arranged under. When the user re-analyzes into a
   * different style, the saved furniture no longer matches and is ignored so the
   * fresh search shows through.
   */
  styleTag?: string;
  /** Budget used when these products were selected. */
  budgetTotal?: number;
  /** Required room features used to build this recommendation set. */
  roomFeatures?: string[];
  items:   PlacedFurniture[];
  savedAt: string;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeItem(value: unknown, category: string): FurnitureItem {
  const item = (value ?? {}) as Partial<FurnitureItem> & { color?: string };
  const color = normalizeColor(item.color);
  return {
    id:       typeof item.id === 'string' ? item.id : '',
    name:     typeof item.name === 'string' ? item.name : '',
    category: typeof item.category === 'string' && item.category ? item.category : category,
    brand:    typeof item.brand === 'string' ? item.brand : '',
    price:    toNumber(item.price),
    imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : '',
    buyUrl:   typeof item.buyUrl === 'string' ? item.buyUrl : '',
    ...(item.widthIn !== undefined ? { widthIn: toNumber(item.widthIn) } : {}),
    ...(item.depthIn !== undefined ? { depthIn: toNumber(item.depthIn) } : {}),
    ...(color ? { color } : {}),
  };
}

function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const raw = value.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) {
    if (raw.length === 4) {
      return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
    }
    return raw.toLowerCase();
  }
  const rgb = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0'))
      .join('')}`;
  }
  return undefined;
}

/** Parse a placement from the API or localStorage; returns null if unusable. */
export function normalizeFurniturePlacement(value: unknown): FurniturePlacement | null {
  if (!value || typeof value !== 'object') return null;

  const layout = value as Partial<FurniturePlacement>;
  if (!Array.isArray(layout.items)) return null;

  const items = layout.items
    .filter((entry): entry is PlacedFurniture =>
      Boolean(entry) && typeof (entry as PlacedFurniture).category === 'string' && Boolean((entry as PlacedFurniture).category))
    .map((entry) => {
      const color = normalizeColor(entry.color)
        || normalizeColor((entry.item as { color?: string } | undefined)?.color);
      const item = normalizeItem(entry.item, entry.category);
      return {
        category: entry.category,
        hidden:   Boolean(entry.hidden),
        x:        toNumber(entry.x),
        y:        toNumber(entry.y),
        rotation: toNumber(entry.rotation),
        scale:    Math.max(0.5, Math.min(2, toNumber(entry.scale, 1))),
        ...(color ? { color } : {}),
        item:     color ? { ...item, color } : item,
      };
    });

  if (items.length === 0) return null;

  return {
    version: typeof layout.version === 'number' ? layout.version : FURNITURE_PLACEMENT_VERSION,
    ...(typeof layout.roomId === 'string' ? { roomId: layout.roomId } : {}),
    ...(typeof layout.styleTag === 'string' ? { styleTag: layout.styleTag } : {}),
    ...(layout.budgetTotal !== undefined ? { budgetTotal: Math.max(0, toNumber(layout.budgetTotal)) } : {}),
    ...(Array.isArray(layout.roomFeatures)
      ? { roomFeatures: layout.roomFeatures.map(String).map((feature) => feature.trim()).filter(Boolean) }
      : {}),
    items,
    savedAt: typeof layout.savedAt === 'string' ? layout.savedAt : new Date().toISOString(),
  };
}

export function buildFurniturePlacement(args: {
  roomId?:   string | null;
  styleTag?: string | null;
  budgetTotal?: number | null;
  roomFeatures?: string[];
  slots:     Record<string, FurnitureItem>;
  hidden:    Set<string>;
  positions: Record<string, PlacementPos>;
  rotations: Record<string, number>;
  scales:    Record<string, number>;
  colors?:   Record<string, string>;
}): FurniturePlacement {
  const { roomId, styleTag, budgetTotal, roomFeatures, slots, hidden, positions, rotations, scales, colors } = args;

  return {
    version: FURNITURE_PLACEMENT_VERSION,
    ...(roomId ? { roomId } : {}),
    ...(styleTag ? { styleTag } : {}),
    ...(budgetTotal !== null && budgetTotal !== undefined
      ? { budgetTotal: Math.max(0, toNumber(budgetTotal)) }
      : {}),
    ...(roomFeatures ? { roomFeatures: [...roomFeatures] } : {}),
    items: Object.values(slots)
      .filter(Boolean)
      .map((item) => {
        const color = normalizeColor(colors?.[item.category]) || normalizeColor((item as FurnitureItem & { color?: string }).color);
        return {
          category: item.category,
          hidden:   hidden.has(item.category),
          x:        toNumber(positions[item.category]?.x),
          y:        toNumber(positions[item.category]?.y),
          rotation: toNumber(rotations[item.category]),
          scale:    Math.max(0.5, Math.min(2, toNumber(scales[item.category], 1))),
          ...(color ? { color } : {}),
          item:     color ? { ...item, color } : item,
        };
      }),
    savedAt: new Date().toISOString(),
  };
}

/** Split a placement into the shapes RoomResult and RoomSVG each need. */
export function readPlacement(placement: FurniturePlacement) {
  const slots:     Record<string, FurnitureItem> = {};
  const positions: Record<string, PlacementPos>  = {};
  const rotations: Record<string, number>        = {};
  const scales:    Record<string, number>        = {};
  const colors:    Record<string, string>        = {};
  const hidden = new Set<string>();

  placement.items.forEach((entry) => {
    slots[entry.category]     = entry.item;
    positions[entry.category] = { x: entry.x, y: entry.y };
    rotations[entry.category] = entry.rotation;
    scales[entry.category]    = entry.scale;
    const color = entry.color || (entry.item as FurnitureItem & { color?: string }).color;
    if (typeof color === 'string' && color) colors[entry.category] = color;
    if (entry.hidden) hidden.add(entry.category);
  });

  return { slots, positions, rotations, scales, colors, hidden };
}

export function readSavedFurniturePlacement(): FurniturePlacement | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(FURNITURE_PLACEMENT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return normalizeFurniturePlacement(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveFurniturePlacementLocally(placement: FurniturePlacement): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FURNITURE_PLACEMENT_STORAGE_KEY, JSON.stringify(placement));
}
