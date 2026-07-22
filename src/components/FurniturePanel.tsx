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
  isoContent?:      ReactNode;
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
  isoContent,
  linkedCategory,
  onLinkCategory,
  hiddenCategories,
  onToggleInRoom,
}: Props) {
  const displayed = orderedFurniture(slots, roomType);
  const total = displayed
    .filter((item) => !hiddenCategories.has(item.category))
    .reduce((sum, item) => sum + item.price, 0);

  const cards = displayed.map((item, i) => (
    <div key={item.category} className="furniture-strip-card shrink-0">
      <FurnitureCard
        item={item}
        canSwap={items.filter((x) => x.category === item.category).length > 1}
        onSwap={() => onSwap(item.category)}
        animDelay={`${0.45 + i * 0.07}s`}
        variant="compact"
        linkedCategory={linkedCategory}
        onLinkCategory={onLinkCategory}
        inRoom={!hiddenCategories.has(item.category)}
        onToggleInRoom={() => onToggleInRoom(item.category)}
      />
    </div>
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

  const views = (
    <div className="result-dual-pane">
      <div className="result-dual-pane__view result-dual-pane__view--iso">
        {isoContent}
      </div>
      <div className="result-dual-pane__view">
        {centerContent}
      </div>
    </div>
  );

  if (loading) {
    return (
      <section className="mb-10 result-furniture-section">
        {header}
        <div className="result-dual-pane">
          <div className="rounded-2xl aspect-[4/3] animate-pulse bg-[#EDE8E1]" />
          <div className="rounded-2xl aspect-[4/3] animate-pulse bg-[#EDE8E1]" />
        </div>
        <div className="furniture-h-strip mt-5">
          <div className="furniture-h-strip__track">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="furniture-strip-card shrink-0 garden-card rounded-2xl border border-[#F7F4D5]/10 p-3 animate-pulse">
                <div className="h-14 bg-[#F7F4D5]/10 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-[#F7F4D5]/30 text-center animate-pulse mt-4">
          Searching for your {style.styleTag} style...
        </p>
      </section>
    );
  }

  if (displayed.length === 0) {
    return (
      <section className="mb-10 result-furniture-section">
        {header}
        {views}
        <p className="text-[#F7F4D5]/40 text-center py-8">No furniture found — try re-analyzing your room.</p>
      </section>
    );
  }

  return (
    <section className="mb-10 result-furniture-section">
      {header}
      {views}
      <div className="furniture-h-strip mt-5 animate-reveal" style={{ animationDelay: '0.5s' }}>
        <div className="furniture-h-strip__label">Shop pieces</div>
        <div className="furniture-h-strip__track custom-furniture-scroll">
          {cards}
        </div>
      </div>
    </section>
  );
}
