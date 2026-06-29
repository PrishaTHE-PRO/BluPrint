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

/** Side columns aligned with where pieces sit on the floor plan */
export const LEFT_LAYOUT_CATEGORIES  = ['sofa', 'side_table', 'coffee_table'] as const;
export const RIGHT_LAYOUT_CATEGORIES = ['floor_lamp', 'accent_chair'] as const;
export const BOTTOM_LAYOUT_CATEGORIES = ['rug'] as const;

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

  const placed = new Set([...left, ...right, ...bottom].map((i) => i.category));
  const extras = orderedFurniture(slots).filter((i) => !placed.has(i.category));

  return {
    left,
    right,
    bottom: [...bottom, ...extras],
  };
}

export const CATEGORY_LABELS: Record<string, string> = {
  sofa:         'Sofa',
  coffee_table: 'Coffee Table',
  rug:          'Rug',
  floor_lamp:   'Floor Lamp',
  accent_chair: 'Accent Chair',
  side_table:   'Side Table',
};
