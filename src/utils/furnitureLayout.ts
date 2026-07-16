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
  bedroom:      ['bed', 'nightstand', 'dresser', 'bedroom_rug', 'wardrobe', 'bedside_lamp'],
  kitchen:      ['island_cart', 'bar_stool', 'kitchen_rug', 'kitchen_storage', 'kitchen_shelf', 'pendant_light'],
  bathroom:     ['vanity', 'bath_mirror', 'bath_storage', 'bath_mat', 'bath_light', 'shower_curtain'],
  home_office:  ['desk', 'office_chair', 'bookshelf', 'desk_lamp', 'storage_cabinet', 'monitor_stand'],
  dining_room:  ['dining_table', 'dining_chair', 'dining_rug', 'sideboard', 'dining_light', 'bar_cabinet'],
  nursery:      ['crib', 'nursery_dresser', 'rocking_chair', 'nursery_rug', 'nursery_shelf', 'nursery_lamp'],
};

/** @deprecated living-room default order */
export const CATEGORY_ORDER = LAYOUTS.living_room;

export function getCategoryOrder(roomType?: string): readonly string[] {
  return LAYOUTS[normalizeRoomType(roomType)];
}

export function orderedFurniture(
  slots: Record<string, FurnitureItem>,
  roomType?: string,
): FurnitureItem[] {
  const order = getCategoryOrder(roomType);
  const ordered = order
    .map((category) => slots[category])
    .filter((item): item is FurnitureItem => Boolean(item));

  // Include any unexpected categories at the end
  const seen = new Set(ordered.map((i) => i.category));
  const extras = Object.values(slots).filter((i) => i && !seen.has(i.category));
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
};

export function isFloorCovering(category: string) {
  return /rug|mat|curtain/i.test(category);
}
