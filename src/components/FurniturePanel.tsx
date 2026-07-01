import type { ReactNode } from 'react';
import type { FurnitureItem, Style } from '../types';
import { groupFurnitureForLayout, orderedFurniture } from '../utils/furnitureLayout';
import FurnitureCard from './FurnitureCard';

interface Props {
  items:            FurnitureItem[];
  slots:            Record<string, FurnitureItem>;
  onSwap:           (category: string) => void;
  style:            Style;
  loading:          boolean;
  centerContent?:   ReactNode;
  linkedCategory?:  string | null;
  onLinkCategory?:  (category: string | null) => void;
}

// Use item.category as key (not item.id) so the card is never unmounted on swap —
// this prevents the animate-reveal glitch that replays the entrance animation.
function renderCard(
  item:           FurnitureItem,
  items:          FurnitureItem[],
  onSwap:         (category: string) => void,
  animIndex:      number,
  linkedCategory: string | null | undefined,
  onLinkCategory: ((category: string | null) => void) | undefined,
) {
  return (
    <FurnitureCard
      key={item.category}
      item={item}
      canSwap={items.filter((x) => x.category === item.category).length > 1}
      onSwap={() => onSwap(item.category)}
      animDelay={`${0.45 + animIndex * 0.07}s`}
      linkedCategory={linkedCategory}
      onLinkCategory={onLinkCategory}
    />
  );
}

export default function FurniturePanel({
  items,
  slots,
  onSwap,
  style,
  loading,
  centerContent,
  linkedCategory,
  onLinkCategory,
}: Props) {
  const displayed = orderedFurniture(slots);
  const total     = displayed.reduce((sum, item) => sum + item.price, 0);
  const { left, right, bottom } = groupFurnitureForLayout(slots);

  const header = (
    <div className="flex items-center justify-between animate-reveal mb-6" style={{ animationDelay: '0.4s' }}>
      <h2 className="text-2xl font-bold flex items-center gap-3">
        Recommended Furniture
        <span className="text-[#D3968C]">
          <iconify-icon icon="ph:magic-wand-duotone" />
        </span>
      </h2>
      {total > 0 && (
        <div className="px-4 py-1.5 rounded-full border bg-[#839958]/20 border-[#839958]/30">
          <span className="text-xs font-bold text-[#F7F4D5]/60">Est. Total:</span>
          <span className="text-base font-bold ml-2 text-[#F7F4D5]">${total.toLocaleString()}</span>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <section className="mb-10">
        {header}
        {/* Skeleton: 3+6+3 columns */}
        <div className="grid lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-3 flex flex-col gap-3">
            {[0, 1].map((i) => (
              <div key={i} className="garden-card rounded-2xl border border-[#F7F4D5]/10 p-3 animate-pulse">
                <div className="aspect-[4/3] bg-[#F7F4D5]/10 rounded-lg mb-2" />
                <div className="h-2.5 bg-[#F7F4D5]/10 rounded w-1/3 mb-1.5" />
                <div className="h-3 bg-[#F7F4D5]/10 rounded w-3/4" />
              </div>
            ))}
          </div>
          <div className="lg:col-span-6">
            <div className="garden-card rounded-2xl border border-[#F7F4D5]/10 aspect-square animate-pulse" />
          </div>
          <div className="lg:col-span-3 flex flex-col gap-3">
            {[2, 3].map((i) => (
              <div key={i} className="garden-card rounded-2xl border border-[#F7F4D5]/10 p-3 animate-pulse">
                <div className="aspect-[4/3] bg-[#F7F4D5]/10 rounded-lg mb-2" />
                <div className="h-2.5 bg-[#F7F4D5]/10 rounded w-1/3 mb-1.5" />
                <div className="h-3 bg-[#F7F4D5]/10 rounded w-3/4" />
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-[#F7F4D5]/30 text-center animate-pulse mt-6">
          Searching furniture stores for your {style.styleTag} style...
        </p>
      </section>
    );
  }

  if (displayed.length === 0) {
    return (
      <section className="mb-10">
        {header}
        {centerContent && <div className="max-w-xl mx-auto mb-8">{centerContent}</div>}
        <p className="text-[#F7F4D5]/40 text-center py-8">No furniture found — try re-analyzing your room.</p>
      </section>
    );
  }

  return (
    <section className="mb-10">
      {header}

      {/* Mobile: floor plan then stacked cards */}
      <div className="lg:hidden flex flex-col gap-4">
        {centerContent && <div className="max-w-md mx-auto w-full">{centerContent}</div>}
        <div className="grid sm:grid-cols-2 gap-3">
          {displayed.map((item, i) => renderCard(item, items, onSwap, i, linkedCategory, onLinkCategory))}
        </div>
      </div>

      {/* Desktop: 3 | 6 | 3 grid */}
      <div className="hidden lg:grid lg:grid-cols-12 gap-4 items-start">
        {/* Left column — 2 cards, stacked */}
        <div className="col-span-3 flex flex-col gap-3">
          {left.map((item, i) =>
            renderCard(item, items, onSwap, i, linkedCategory, onLinkCategory)
          )}
        </div>

        {/* Center — floor plan */}
        <div className="col-span-6">
          {centerContent && <div className="w-full">{centerContent}</div>}
        </div>

        {/* Right column — 2 cards, stacked */}
        <div className="col-span-3 flex flex-col gap-3">
          {right.map((item, i) =>
            renderCard(item, items, onSwap, i + left.length, linkedCategory, onLinkCategory)
          )}
        </div>
      </div>

      {/* Bottom row — centered under the floor plan (col 4–9 in the same 12-col grid) */}
      {bottom.length > 0 && (
        <div className="hidden lg:grid lg:grid-cols-12 gap-4 mt-3">
          <div
            className={`col-start-4 col-span-6 grid gap-3 ${bottom.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'}`}
          >
            {bottom.map((item, i) =>
              renderCard(item, items, onSwap, i + left.length + right.length, linkedCategory, onLinkCategory)
            )}
          </div>
        </div>
      )}
    </section>
  );
}
