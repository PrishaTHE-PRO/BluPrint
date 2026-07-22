/** Infer a silhouette from product category + title (round table, bean bag, etc.). */

export type FurnitureForm =
  | 'default'
  | 'round_table'
  | 'oval_table'
  | 'beanbag'
  | 'lounge_chair';

export function furnitureForm(category: string, name = ''): FurnitureForm {
  const n = (name || '').toLowerCase();

  const tableCats = new Set([
    'coffee_table', 'side_table', 'dining_table', 'nightstand', 'monitor_stand',
  ]);
  if (tableCats.has(category)) {
    if (/\b(oval|elliptical)\b/.test(n)) return 'oval_table';
    if (/\b(round|circular|circle|drum)\b/.test(n)) return 'round_table';
    // Near-square footprint often means round in product photos with square bbox
    if (category === 'coffee_table' && /\b(pedestal|drum table)\b/.test(n)) return 'round_table';
  }

  if (category === 'reading_nook' || category === 'accent_chair' || category === 'rocking_chair') {
    if (/\b(bean\s*bag?|beanbag|pouf|floor cushion)\b/.test(n)) return 'beanbag';
    if (
      category === 'reading_nook'
      || /\b(lounge|chaise|recliner|tub chair|barrel chair|accent|wingback|arm.?chair)\b/.test(n)
    ) {
      return 'lounge_chair';
    }
  }

  return 'default';
}
