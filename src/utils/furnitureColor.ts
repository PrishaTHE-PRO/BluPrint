/** Resolve a display color for recommended furniture (image sample + name + palette). */

/** Warm wood / textile neutrals — never default to blue. */
const CATEGORY_FALLBACK: Record<string, string> = {
  sofa: '#8B7355',
  accent_chair: '#A67C52',
  coffee_table: '#C4A574',
  rug: '#C9B8A0',
  floor_lamp: '#E8D9A8',
  side_table: '#B8956C',
  bed: '#D4C4A8',
  nightstand: '#B8956C',
  dresser: '#A08060',
  bedroom_rug: '#C9B8A0',
  wardrobe: '#8B7355',
  bedside_lamp: '#E8D9A8',
  desk: '#C4A574',
  dining_table: '#C4A574',
  dining_chair: '#A67C52',
  bookshelf: '#8B7355',
  bookcase: '#8B7355',
  crib: '#D4C4A8',
  indoor_plants: '#5d8a62',
  rocking_chair: '#A67C52',
  office_chair: '#6B5B4F',
  sideboard: '#A08060',
  vanity: '#A08060',
  bathtub: '#D8D2C8',
  standing_shower: '#C5D5E0',
  shower_curtain: '#C9B8A0',
  nursery_dresser: '#A08060',
  kitchen_storage: '#A08060',
  bar_cabinet: '#8B7355',
  storage_cabinet: '#8B7355',
};

/** Common finish / fabric words in shopping titles → hex. */
const NAME_COLORS: Array<{ re: RegExp; hex: string }> = [
  { re: /\b(walnut|dark walnut)\b/i, hex: '#5C4033' },
  { re: /\b(espresso|mocha|dark brown)\b/i, hex: '#4A3728' },
  { re: /\b(mahogany|cherry)\b/i, hex: '#6B3A2A' },
  { re: /\b(oak|white oak|light oak)\b/i, hex: '#C4A574' },
  { re: /\b(maple|birch|pine|ash)\b/i, hex: '#D2B48C' },
  { re: /\b(teak|honey|caramel)\b/i, hex: '#B8860B' },
  { re: /\b(natural wood|wood finish|wooden)\b/i, hex: '#B8956C' },
  { re: /\b(black|charcoal|ebony)\b/i, hex: '#2C2C2C' },
  { re: /\b(white|ivory|cream|off[\s-]?white)\b/i, hex: '#F0E6D8' },
  { re: /\b(beige|taupe|sand|khaki)\b/i, hex: '#C8B89A' },
  { re: /\b(grey|gray|slate)\b/i, hex: '#8A8A8A' },
  { re: /\b(navy|midnight blue)\b/i, hex: '#2C3E6B' },
  { re: /\b(blue|teal|aqua)\b/i, hex: '#5B7C99' },
  { re: /\b(green|sage|olive|forest)\b/i, hex: '#6B7F5A' },
  { re: /\b(blush|pink|rose)\b/i, hex: '#D4A5A5' },
  { re: /\b(terracotta|rust|copper|burnt orange)\b/i, hex: '#C4785A' },
  { re: /\b(mustard|gold|brass)\b/i, hex: '#C4A035' },
  { re: /\b(linen|boucle|beige linen)\b/i, hex: '#D8CBB8' },
  { re: /\b(velvet)\b/i, hex: '#6B4C6B' },
  { re: /\b(rattan|cane|wicker|bamboo)\b/i, hex: '#C9A66B' },
];

const sampleCache = new Map<string, string | null>();

export function shadeHex(color: string, amt: number): string {
  let r: number, g: number, b: number;
  if (color[0] === '#') {
    const raw = color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
    const n = parseInt(raw.slice(1), 16);
    r = (n >> 16) & 255;
    g = (n >> 8) & 255;
    b = n & 255;
  } else {
    const m = color.match(/\d+/g) || ['0', '0', '0'];
    r = +m[0];
    g = +m[1];
    b = +m[2];
  }
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function colorFromName(name = ''): string | null {
  if (!name) return null;
  for (const { re, hex } of NAME_COLORS) {
    if (re.test(name)) return hex;
  }
  return null;
}

export function paletteFallback(category: string, palette: string[] = []): string {
  const cleaned = palette.map((c) => c.trim()).filter((c) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c));
  if (cleaned.length > 0) {
    let h = 0;
    for (let i = 0; i < category.length; i++) h = (h * 33 + category.charCodeAt(i)) >>> 0;
    return cleaned[h % cleaned.length];
  }
  return CATEGORY_FALLBACK[category] || '#C4A574';
}

/** Same-origin proxy so canvas can read pixels from retailer CDNs. */
function proxiedImageUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('/api/') || url.startsWith('data:') || url.startsWith('blob:')) return url;
  try {
    const abs = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (typeof window !== 'undefined' && abs.origin === window.location.origin) return url;
  } catch {
    /* fall through */
  }
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

/** Average the non-background pixels of a product image. */
export function sampleImageColor(url: string): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  if (sampleCache.has(url)) return Promise.resolve(sampleCache.get(url) ?? null);

  return new Promise((resolve) => {
    const img = new Image();
    const finish = (value: string | null) => {
      sampleCache.set(url, value);
      resolve(value);
    };
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return finish(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const R = data[i], G = data[i + 1], B = data[i + 2], A = data[i + 3];
          if (A < 140) continue;
          const max = Math.max(R, G, B);
          const min = Math.min(R, G, B);
          if (max > 248 && min > 235) continue;
          if (max < 18) continue;
          if (max > 240 && (max - min) < 18) continue;
          r += R; g += G; b += B; n += 1;
        }
        if (!n) return finish(null);
        const hex = `#${[r / n, g / n, b / n]
          .map((v) => Math.round(v).toString(16).padStart(2, '0'))
          .join('')}`;
        finish(hex);
      } catch {
        finish(null);
      }
    };
    img.onerror = () => finish(null);
    img.src = proxiedImageUrl(url);
  });
}

export type FurnitureColorTones = {
  base: string;
  dark: string;
  mid: string;
  light: string;
};

export function tonesFrom(color?: string | null, category = ''): FurnitureColorTones {
  const base = color || CATEGORY_FALLBACK[category] || '#C4A574';
  return {
    base,
    dark: shadeHex(base, -0.14),
    mid: shadeHex(base, -0.06),
    light: shadeHex(base, 0.16),
  };
}

export async function resolveFurnitureColors(
  items: Array<{ category: string; imageUrl?: string; name?: string; id?: string }>,
  palette: string[] = [],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    items.map(async (item) => {
      const sampled = item.imageUrl ? await sampleImageColor(item.imageUrl) : null;
      const fromName = colorFromName(item.name);
      const color = sampled || fromName || paletteFallback(item.category, palette);
      return [item.category, color] as const;
    }),
  );
  return Object.fromEntries(entries);
}
