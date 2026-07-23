import type { FurnitureItem } from '../types';

export type RoomTypeKey =
  | 'living_room'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'home_office'
  | 'dining_room'
  | 'nursery';

export function normalizeRoomType(roomType?: string): RoomTypeKey {
  const t = String(roomType || '').toLowerCase();
  if (t.includes('bed')) return 'bedroom';
  if (t.includes('kitchen')) return 'kitchen';
  if (t.includes('bath')) return 'bathroom';
  if (t.includes('office') || t.includes('study')) return 'home_office';
  if (t.includes('dining')) return 'dining_room';
  if (t.includes('nursery') || t.includes('baby')) return 'nursery';
  return 'living_room';
}

const LAYOUTS: Record<RoomTypeKey, readonly string[]> = {
  living_room:  ['sofa', 'coffee_table', 'rug', 'floor_lamp', 'accent_chair', 'side_table'],
  // Keep bedrooms airy: one bed zone + light storage — no wardrobe by default.
  bedroom:      ['bed', 'nightstand', 'bedroom_rug', 'bedside_lamp', 'dresser'],
  kitchen:      ['island_cart', 'bar_stool', 'kitchen_rug', 'kitchen_storage', 'kitchen_shelf', 'pendant_light'],
  bathroom:     ['vanity', 'bath_mirror', 'bath_storage', 'bath_mat', 'bath_light', 'bathtub', 'standing_shower', 'shower_curtain'],
  home_office:  ['desk', 'office_chair', 'bookshelf', 'desk_lamp', 'storage_cabinet', 'monitor_stand'],
  dining_room:  ['dining_table', 'dining_chair', 'dining_rug', 'sideboard', 'dining_light', 'bar_cabinet'],
  nursery:      ['crib', 'nursery_dresser', 'rocking_chair', 'nursery_rug', 'nursery_shelf', 'nursery_lamp'],
};

/** Seating extras that fight each other in a bedroom if all placed. */
const BEDROOM_SEATING = new Set(['reading_nook', 'accent_chair', 'rocking_chair']);
/** Large extras — at most one in a bedroom. */
const BEDROOM_LARGE = new Set(['wardrobe', 'workspace_desk', 'vanity_station', 'bookcase']);
/** Small accents that read well without crowding. */
const BEDROOM_SMALL = ['indoor_plants', 'wall_art', 'full_length_mirror', 'floating_shelves', 'smart_lighting'];

/**
 * Drop redundant / oversized pieces so bedrooms stay walkable and balanced.
 * Core layout pieces always win; extras are capped.
 */
export function curateFurnitureSlots(
  slots: Record<string, FurnitureItem>,
  roomType?: string,
): Record<string, FurnitureItem> {
  if (normalizeRoomType(roomType) !== 'bedroom') return slots;

  const core = new Set(LAYOUTS.bedroom);
  const next: Record<string, FurnitureItem> = {};

  for (const category of LAYOUTS.bedroom) {
    if (slots[category]) next[category] = slots[category];
  }

  // At most one accent seat, tucked as a secondary — never a chair cluster.
  for (const category of BEDROOM_SEATING) {
    if (slots[category]) {
      next[category] = slots[category];
      break;
    }
  }

  // At most one large storage/furniture add-on — skip wardrobe when a dresser
  // already covers storage so the room doesn't fill with cabinets.
  const largeOrder = slots.dresser
    ? ['bookcase', 'vanity_station', 'workspace_desk']
    : ['wardrobe', 'bookcase', 'vanity_station', 'workspace_desk'];
  for (const category of largeOrder) {
    if (slots[category] && !core.has(category)) {
      next[category] = slots[category];
      break;
    }
  }

  // Up to two small accents.
  let smallKept = 0;
  for (const category of BEDROOM_SMALL) {
    if (smallKept >= 2) break;
    if (slots[category]) {
      next[category] = slots[category];
      smallKept += 1;
    }
  }

  // Preserve any already-core / selected keys; ignore leftover bulk categories.
  for (const [category, item] of Object.entries(slots)) {
    if (!item) continue;
    if (next[category]) continue;
    if (core.has(category)) next[category] = item;
  }

  return next;
}

/** @deprecated living-room default order */
export const CATEGORY_ORDER = LAYOUTS.living_room;

export function getCategoryOrder(roomType?: string): readonly string[] {
  return LAYOUTS[normalizeRoomType(roomType)];
}

export function orderedFurniture(
  slots: Record<string, FurnitureItem>,
  roomType?: string,
): FurnitureItem[] {
  const curated = curateFurnitureSlots(slots, roomType);
  const order = getCategoryOrder(roomType);
  const ordered = order
    .map((category) => curated[category])
    .filter((item): item is FurnitureItem => Boolean(item));

  // Include curated extras (features) after the core order.
  const seen = new Set(ordered.map((i) => i.category));
  const extras = Object.values(curated).filter((i) => i && !seen.has(i.category));

  // Stable aesthetic order for bedroom extras: seating, then large, then small.
  extras.sort((a, b) => {
    const rank = (category: string) => {
      if (BEDROOM_SEATING.has(category)) return 0;
      if (BEDROOM_LARGE.has(category)) return 1;
      if (BEDROOM_SMALL.includes(category)) return 2;
      return 3;
    };
    return rank(a.category) - rank(b.category);
  });

  return [...ordered, ...extras];
}

/** Keep for callers that still split columns — now unused by left-rail layout */
export function groupFurnitureForLayout(
  slots: Record<string, FurnitureItem>,
  roomType?: string,
) {
  const all = orderedFurniture(slots, roomType);
  return { left: all, right: [] as FurnitureItem[], bottom: [] as FurnitureItem[] };
}

export const CATEGORY_LABELS: Record<string, string> = {
  sofa: 'Sofa',
  coffee_table: 'Coffee Table',
  rug: 'Rug',
  floor_lamp: 'Floor Lamp',
  accent_chair: 'Accent Chair',
  side_table: 'Side Table',
  bed: 'Bed',
  nightstand: 'Nightstand',
  dresser: 'Dresser',
  bedroom_rug: 'Rug',
  wardrobe: 'Wardrobe',
  bedside_lamp: 'Bedside Lamp',
  bar_stool: 'Bar Stool',
  pendant_light: 'Pendant Light',
  kitchen_rug: 'Kitchen Rug',
  kitchen_storage: 'Storage',
  island_cart: 'Island Cart',
  kitchen_shelf: 'Shelf',
  vanity: 'Vanity',
  bath_mirror: 'Mirror',
  bath_storage: 'Storage',
  bath_mat: 'Bath Mat',
  bath_light: 'Bath Light',
  shower_curtain: 'Shower Curtain',
  bathtub: 'Bathtub',
  standing_shower: 'Standing Shower',
  desk: 'Desk',
  office_chair: 'Office Chair',
  bookshelf: 'Bookshelf',
  desk_lamp: 'Desk Lamp',
  storage_cabinet: 'Cabinet',
  monitor_stand: 'Monitor Stand',
  dining_table: 'Dining Table',
  dining_chair: 'Dining Chair',
  dining_rug: 'Rug',
  sideboard: 'Sideboard',
  dining_light: 'Dining Light',
  bar_cabinet: 'Bar Cabinet',
  crib: 'Crib',
  nursery_dresser: 'Dresser',
  rocking_chair: 'Rocking Chair',
  nursery_rug: 'Rug',
  nursery_shelf: 'Shelf',
  nursery_lamp: 'Lamp',
  reading_nook: 'Reading Nook Chair',
  smart_lighting: 'Smart Lighting',
  floating_shelves: 'Floating Shelves',
  indoor_plants: 'Indoor Plant',
  full_length_mirror: 'Full-Length Mirror',
  wall_art: 'Wall Art',
  workspace_desk: 'Workspace Desk',
  vanity_station: 'Vanity Station',
  bookcase: 'Bookcase',
};

export function isFloorCovering(category: string) {
  return /rug|mat/i.test(category);
}

/** Small pieces that can sit on top of other furniture. */
const STACKABLE_CATEGORIES = new Set([
  'bedside_lamp',
  'desk_lamp',
  'nursery_lamp',
  'bath_mirror',
  'bath_light',
  'monitor_stand',
  'indoor_plants',
]);

/** Furniture tops that can hold stackable pieces. */
const SURFACE_CATEGORIES = new Set([
  'nightstand',
  'desk',
  'workspace_desk',
  'vanity',
  'vanity_station',
  'dresser',
  'nursery_dresser',
  'sideboard',
  'side_table',
  'coffee_table',
  'dining_table',
  'island_cart',
  'bookshelf',
  'bookcase',
  'kitchen_shelf',
  'nursery_shelf',
  'kitchen_storage',
  'bath_storage',
  'storage_cabinet',
  'bar_cabinet',
  'monitor_stand',
]);

/** Preferred parent surface for initial auto-layout. */
export const STACK_PARENT: Record<string, string> = {
  bedside_lamp: 'nightstand',
  bath_mirror: 'vanity',
  bath_light: 'vanity',
  desk_lamp: 'desk',
  monitor_stand: 'desk',
  nursery_lamp: 'nursery_dresser',
  indoor_plants: 'side_table',
};

export function isStackable(category: string) {
  return STACKABLE_CATEGORIES.has(category);
}

export function isSurface(category: string) {
  return SURFACE_CATEGORIES.has(category);
}

/** True when one piece may share a footprint with the other (lamp on desk, mirror on vanity, …). */
export function canStackTogether(a: string, b: string) {
  return (isStackable(a) && isSurface(b)) || (isSurface(a) && isStackable(b));
}
