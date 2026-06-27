import { useState, useEffect } from 'react';
import type { FurnitureItem, Style } from '../types';
import FurnitureCard from './FurnitureCard';

interface Props {
  items:   FurnitureItem[];
  style:   Style;
  loading: boolean;
}

export default function FurniturePanel({ items, style, loading }: Props) {
  const [slots, setSlots] = useState<Record<string, FurnitureItem>>({});

  useEffect(() => {
    const init: Record<string, FurnitureItem> = {};
    items.forEach((item) => { if (!init[item.category]) init[item.category] = item; });
    setSlots(init);
  }, [items]);

  function handleSwap(category: string) {
    const inCategory = items.filter((i) => i.category === category);
    if (inCategory.length < 2) return;
    const current = slots[category];
    const idx     = inCategory.findIndex((i) => i.id === current?.id);
    const next    = inCategory[(idx + 1) % inCategory.length];
    setSlots((prev) => ({ ...prev, [category]: next }));
  }

  const displayed = Object.values(slots);
  const total     = displayed.reduce((sum, item) => sum + item.price, 0);

  if (loading) {
    return (
      <div className="lg:col-span-7 flex flex-col gap-8">
        <div className="flex items-center justify-between animate-reveal" style={{ animationDelay: '0.4s' }}>
          <h2 className="text-3xl font-bold flex items-center gap-4">
            Recommended Furniture
            <span className="text-[#D3968C] animate-pulse">
              <iconify-icon icon="ph:magic-wand-duotone" />
            </span>
          </h2>
        </div>
        <div className="flex flex-col gap-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="garden-card ghibli-border p-6 flex gap-8 animate-pulse">
              <div className="w-32 h-32 bg-[#F7F4D5]/10 rounded-3xl flex-shrink-0" />
              <div className="flex-1 flex flex-col justify-center gap-3">
                <div className="h-3 bg-[#F7F4D5]/10 rounded w-1/4" />
                <div className="h-5 bg-[#F7F4D5]/10 rounded w-2/3" />
                <div className="h-3 bg-[#F7F4D5]/10 rounded w-1/3 mt-2" />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#F7F4D5]/30 text-center animate-pulse">
          Searching furniture stores for your {style.styleTag} style...
        </p>
      </div>
    );
  }

  return (
    <div className="lg:col-span-7 flex flex-col gap-8">
      <div className="flex items-center justify-between animate-reveal" style={{ animationDelay: '0.4s' }}>
        <h2 className="text-3xl font-bold flex items-center gap-4">
          Recommended Furniture
          <span className="text-[#D3968C] animate-pulse">
            <iconify-icon icon="ph:magic-wand-duotone" />
          </span>
        </h2>
        {total > 0 && (
          <div className="px-6 py-2 rounded-full border bg-[#839958]/20 border-[#839958]/30">
            <span className="text-sm font-bold text-[#F7F4D5]/60">Est. Total:</span>
            <span className="text-lg font-bold ml-2 text-[#F7F4D5]">${total.toLocaleString()}</span>
          </div>
        )}
      </div>

      {displayed.length === 0 ? (
        <p className="text-[#F7F4D5]/40 text-center py-12">No furniture found — try re-analyzing your room.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {displayed.map((item, i) => (
            <FurnitureCard
              key={item.category}
              item={item}
              canSwap={items.filter((x) => x.category === item.category).length > 1}
              onSwap={() => handleSwap(item.category)}
              animDelay={`${0.5 + i * 0.1}s`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
