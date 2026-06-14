import { useState } from 'react';
import type { FurnitureItem, Style } from '../types';
import FurnitureCard from './FurnitureCard';

interface Props {
  items: FurnitureItem[];
  style: Style;
}

export default function FurniturePanel({ items, style }: Props) {
  // one slot per category — tracks which item is currently shown
  const [slots, setSlots] = useState<Record<string, FurnitureItem>>(() => {
    const init: Record<string, FurnitureItem> = {};
    items.forEach((item) => { if (!init[item.category]) init[item.category] = item; });
    return init;
  });

  function handleSwap(category: string, next: FurnitureItem) {
    setSlots((prev) => ({ ...prev, [category]: next }));
  }

  const displayed = Object.values(slots);
  const total     = displayed.reduce((sum, item) => sum + item.price, 0);
  const over      = total > style.budgetTotal;

  return (
    <div className="lg:col-span-7 flex flex-col gap-8">
      {/* header row */}
      <div className="flex items-center justify-between animate-reveal" style={{ animationDelay: '0.4s' }}>
        <h2 className="text-3xl font-bold flex items-center gap-4">
          Recommended Furniture
          <span className="text-[#D3968C] animate-pulse">
            <iconify-icon icon="ph:magic-wand-duotone" />
          </span>
        </h2>
        <div className={`px-6 py-2 rounded-full border ${over ? 'bg-red-500/10 border-red-400/30' : 'bg-[#839958]/20 border-[#839958]/30'}`}>
          <span className="text-sm font-bold text-[#F7F4D5]/60">Budget:</span>
          <span className={`text-lg font-bold ml-2 ${over ? 'text-red-300' : 'text-[#F7F4D5]'}`}>
            ${total} / ${style.budgetTotal}
          </span>
        </div>
      </div>

      {/* cards */}
      <div className="flex flex-col gap-6">
        {displayed.map((item, i) => (
          <FurnitureCard
            key={item.category}
            item={item}
            allItems={items}
            onSwap={(next) => handleSwap(item.category, next)}
            animDelay={`${0.5 + i * 0.1}s`}
          />
        ))}
      </div>

      {over && (
        <p className="text-xs text-red-300/70 text-center">
          Over budget by ${total - style.budgetTotal} — try swapping some items
        </p>
      )}
    </div>
  );
}
