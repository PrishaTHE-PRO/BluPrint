import type { ReactNode } from 'react';
import type { FurnitureItem, Style } from '../types';
import { orderedFurniture } from '../utils/furnitureLayout';
import FurnitureCard from './FurnitureCard';

interface Props {
  items:            FurnitureItem[];
  slots:            Record<string, FurnitureItem>;
  onSwap:           (category: string) => void;
  style:            Style;
  loading:          boolean;
  roomType?:        string;
  centerContent?:   ReactNode;
  linkedCategory?:  string | null;
  onLinkCategory?:  (category: string | null) => void;
  hiddenCategories: Set<string>;
  onToggleInRoom:   (category: string) => void;
}

export default function FurniturePanel({
  items,
  slots,
  onSwap,
  style,
  loading,
  roomType,
  centerContent,
  linkedCategory,
  onLinkCategory,
  hiddenCategories,
  onToggleInRoom,
}: Props) {
  const displayed = orderedFurniture(slots, roomType);
  // Pieces taken off the floor plan don't count toward the estimate.
  const total     = displayed
    .filter((item) => !hiddenCategories.has(item.category))
    .reduce((sum, item) => sum + item.price, 0);

  const cards = displayed.map((item, i) => (
    <FurnitureCard
      key={item.category}
      item={item}
      canSwap={items.filter((x) => x.category === item.category).length > 1}
      onSwap={() => onSwap(item.category)}
      animDelay={`${0.45 + i * 0.07}s`}
      linkedCategory={linkedCategory}
      onLinkCategory={onLinkCategory}
      inRoom={!hiddenCategories.has(item.category)}
      onToggleInRoom={() => onToggleInRoom(item.category)}
    />
  ));

  const header = (
    <div className="flex items-center justify-between animate-reveal mb-4 shrink-0" style={{ animationDelay: '0.4s' }}>
      <h2 className="text-xl font-bold flex items-center gap-2">
        Furniture
        <span className="text-[#D3968C]">
          <iconify-icon icon="ph:magic-wand-duotone" />
        </span>
      </h2>
      {total > 0 && (
        <div className={`px-3 py-1 rounded-full border ${
          style.budgetTotal > 0 && total > style.budgetTotal
            ? 'bg-[#D3968C]/20 border-[#D3968C]/30'
            : 'bg-[#839958]/20 border-[#839958]/30'
        }`}>
          <span className="text-[10px] font-bold text-[#F7F4D5]/60">Est.</span>
          <span className="text-sm font-bold ml-1.5 text-[#F7F4D5]">${total.toLocaleString()}</span>
          {style.budgetTotal > 0 && (
            <span className="text-[10px] font-bold text-[#F7F4D5]/50 ml-1">
              / ${style.budgetTotal.toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <section className="mb-10">
        <div className="result-workspace grid lg:grid-cols-12 gap-7 items-start">
          <div className="lg:col-span-8">
            <div className="rounded-2xl aspect-[4/3] animate-pulse bg-[#EDE8E1]" />
          </div>
          <aside className="lg:col-span-4 furniture-scroll-panel">
            {header}
            <div className="flex flex-col gap-3 max-h-[70vh] overflow-hidden">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="garden-card rounded-2xl border border-[#F7F4D5]/10 p-3 animate-pulse">
                  <div className="aspect-[4/3] bg-[#F7F4D5]/10 rounded-lg mb-2" />
                  <div className="h-2.5 bg-[#F7F4D5]/10 rounded w-1/3 mb-1.5" />
                  <div className="h-3 bg-[#F7F4D5]/10 rounded w-3/4" />
                </div>
              ))}
            </div>
            <p className="text-xs text-[#F7F4D5]/30 text-center animate-pulse mt-4">
              Searching for your {style.styleTag} style...
            </p>
          </aside>
        </div>
      </section>
    );
  }

  if (displayed.length === 0) {
    return (
      <section className="mb-10">
        <div className="result-workspace grid lg:grid-cols-12 gap-7 items-start">
          <div className="lg:col-span-8">
            {centerContent}
          </div>
          <aside className="lg:col-span-4 furniture-scroll-panel">
            {header}
            <p className="text-[#F7F4D5]/40 text-center py-8">No furniture found — try re-analyzing your room.</p>
          </aside>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-10">
      <div className="lg:hidden flex flex-col gap-4">
        <div>{centerContent}</div>
        {header}
        <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1 custom-furniture-scroll">
          {cards}
        </div>
      </div>

      <div className="result-workspace hidden lg:grid lg:grid-cols-12 gap-7 items-start">
        <div className="col-span-8 min-w-0">
          {centerContent && <div className="w-full">{centerContent}</div>}
        </div>

        <aside className="col-span-4 furniture-scroll-panel flex flex-col min-h-0 h-full">
          {header}
          <div className="flex flex-col gap-2.5 flex-1 min-h-0 overflow-y-auto overscroll-contain pr-2 custom-furniture-scroll">
            {cards}
          </div>
        </aside>
      </div>
    </section>
  );
}
