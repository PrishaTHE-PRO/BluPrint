import type { FurnitureItem } from '../types';

/** Stable order — matches API categories and default floor-plan positions */
export const CATEGORY_ORDER = [
  'sofa',
  'coffee_table',
  'rug',
  'floor_lamp',
  'accent_chair',
  'side_table',
] as const;

/**
 * 2-left | floor plan | 2-right layout, with 2 cards centered below.
 * Left + right always have the same count so the floor plan stays balanced.
 */
export const LEFT_LAYOUT_CATEGORIES   = ['sofa',       'coffee_table'] as const;
export const RIGHT_LAYOUT_CATEGORIES  = ['floor_lamp',  'accent_chair'] as const;
export const BOTTOM_LAYOUT_CATEGORIES = ['rug',         'side_table']   as const;

export function orderedFurniture(slots: Record<string, FurnitureItem>): FurnitureItem[] {
  return CATEGORY_ORDER
    .map((category) => slots[category])
    .filter((item): item is FurnitureItem => Boolean(item));
}

export function groupFurnitureForLayout(slots: Record<string, FurnitureItem>) {
  const pick = (categories: readonly string[]) =>
    categories.map((c) => slots[c]).filter((item): item is FurnitureItem => Boolean(item));

  const left   = pick(LEFT_LAYOUT_CATEGORIES);
  const right  = pick(RIGHT_LAYOUT_CATEGORIES);
  const bottom = pick(BOTTOM_LAYOUT_CATEGORIES);

  // Any category not already placed goes to bottom
  const placed = new Set<string>([...LEFT_LAYOUT_CATEGORIES, ...RIGHT_LAYOUT_CATEGORIES, ...BOTTOM_LAYOUT_CATEGORIES]);
  const extras = orderedFurniture(slots).filter((i) => !placed.has(i.category));

  return { left, right, bottom: [...bottom, ...extras] };
}

export const CATEGORY_LABELS: Record<string, string> = {
  sofa:         'Sofa',
  coffee_table: 'Coffee Table',
  rug:          'Rug',
  floor_lamp:   'Floor Lamp',
  accent_chair: 'Accent Chair',
  side_table:   'Side Table',
};
