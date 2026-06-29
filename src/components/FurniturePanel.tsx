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

function renderCard(
  item: FurnitureItem,
  items: FurnitureItem[],
  onSwap: (category: string) => void,
  i: number,
  linkedCategory: string | null | undefined,
  onLinkCategory: ((category: string | null) => void) | undefined,
  variant: 'featured' | 'compact' = 'featured',
) {
  return (
    <FurnitureCard
      key={`${item.category}-${item.id}`}
      item={item}
      variant={variant}
      canSwap={items.filter((x) => x.category === item.category).length > 1}
      onSwap={() => onSwap(item.category)}
      animDelay={`${0.45 + i * 0.06}s`}
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
        <div className="grid lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-3 flex flex-col gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="garden-card ghibli-border p-5 animate-pulse">
                <div className="aspect-[4/3] bg-[#F7F4D5]/10 rounded-2xl mb-4" />
                <div className="h-3 bg-[#F7F4D5]/10 rounded w-3/4 mb-2" />
                <div className="h-4 bg-[#F7F4D5]/10 rounded w-1/2" />
              </div>
            ))}
          </div>
          <div className="lg:col-span-6">
            <div className="garden-card ghibli-border p-6 animate-pulse aspect-square max-w-md mx-auto rounded-3xl" />
          </div>
          <div className="lg:col-span-3 flex flex-col gap-4">
            {[2, 3].map((i) => (
              <div key={i} className="garden-card ghibli-border p-5 animate-pulse">
                <div className="aspect-[4/3] bg-[#F7F4D5]/10 rounded-2xl mb-4" />
                <div className="h-3 bg-[#F7F4D5]/10 rounded w-3/4 mb-2" />
                <div className="h-4 bg-[#F7F4D5]/10 rounded w-1/2" />
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
        {centerContent && (
          <div className="max-w-md mx-auto mb-8">{centerContent}</div>
        )}
        <p className="text-[#F7F4D5]/40 text-center py-8">No furniture found — try re-analyzing your room.</p>
      </section>
    );
  }

  return (
    <section className="mb-10">
      {header}

      <div className="lg:hidden flex flex-col gap-5">
        {centerContent && <div className="max-w-md mx-auto w-full">{centerContent}</div>}
        <div className="grid sm:grid-cols-2 gap-3">
          {displayed.map((item, i) => renderCard(item, items, onSwap, i, linkedCategory, onLinkCategory))}
        </div>
      </div>

      <div className="hidden lg:grid lg:grid-cols-12 gap-4 items-start">
        <div className="col-span-2 flex flex-col gap-3">
          {left.map((item, i) => renderCard(item, items, onSwap, i, linkedCategory, onLinkCategory))}
        </div>

        <div className="col-span-8 flex justify-center">
          {centerContent && (
            <div className="w-full max-w-xl">{centerContent}</div>
          )}
        </div>

        <div className="col-span-2 flex flex-col gap-3">
          {right.map((item, i) => renderCard(item, items, onSwap, i + left.length, linkedCategory, onLinkCategory))}
        </div>
      </div>

      {bottom.length > 0 && (
        <div className="hidden lg:grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-5 max-w-3xl mx-auto">
          {bottom.map((item, i) => renderCard(item, items, onSwap, i + left.length + right.length, linkedCategory, onLinkCategory))}
        </div>
      )}
    </section>
  );
}
