import { useState, useEffect } from 'react';
import type { FurnitureItem } from '../types';
import { CATEGORY_LABELS } from '../utils/furnitureLayout';

interface Props {
  item:             FurnitureItem;
  canSwap:          boolean;
  onSwap:           () => void;
  animDelay:        string;
  variant?:         'compact' | 'featured';
  linkedCategory?:  string | null;
  onLinkCategory?:  (category: string | null) => void;
}

const CATEGORY_FALLBACK: Record<string, string> = {
  sofa:         'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=400',
  coffee_table: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&q=80&w=400',
  rug:          'https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=400',
  floor_lamp:   'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=400',
  accent_chair: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=400',
  side_table:   'https://images.unsplash.com/photo-1532372320572-cda25653a26d?auto=format&fit=crop&q=80&w=400',
};

export default function FurnitureCard({
  item,
  canSwap,
  onSwap,
  animDelay,
  variant = 'featured',
  linkedCategory,
  onLinkCategory,
}: Props) {
  const [imgSrc, setImgSrc] = useState(item.imageUrl || CATEGORY_FALLBACK[item.category] || '');

  useEffect(() => {
    setImgSrc(item.imageUrl || CATEGORY_FALLBACK[item.category] || '');
  }, [item.id, item.imageUrl, item.category]);

  const isLinked = linkedCategory === item.category;
  const isDimmed = Boolean(linkedCategory && linkedCategory !== item.category);
  const categoryLabel = CATEGORY_LABELS[item.category] ?? item.category;

  const linkProps = {
    onMouseEnter: () => onLinkCategory?.(item.category),
    onMouseLeave: () => onLinkCategory?.(null),
  };

  const shellClass = [
    'garden-card rounded-2xl border border-[#F7F4D5]/10 group animate-reveal transition-all duration-200',
    isLinked ? 'ring-2 ring-[#D3968C] ring-offset-2 ring-offset-[#0A3323] scale-[1.02]' : '',
    isDimmed ? 'opacity-40' : 'opacity-100',
  ].join(' ');

  if (variant === 'compact') {
    return (
      <div className={`${shellClass} p-2.5 flex gap-2.5`} style={{ animationDelay: animDelay }} {...linkProps}>
        <div className="w-14 h-14 bg-[#F7F4D5]/10 rounded-lg overflow-hidden shadow-inner flex-shrink-0 relative">
          <img
            src={imgSrc}
            alt={item.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            onError={() => setImgSrc(CATEGORY_FALLBACK[item.category] ?? '')}
          />
        </div>
        <div className="flex-1 flex flex-col justify-between min-w-0">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#839958] truncate">
              {categoryLabel}{item.brand ? ` · ${item.brand}` : ''}
            </p>
            <h3 className="text-xs font-bold leading-tight line-clamp-2 mt-0.5">{item.name}</h3>
          </div>
          <div className="flex items-center justify-between gap-1 mt-1.5">
            <span className="text-sm font-bold text-[#F7F4D5] flex-shrink-0">
              {item.price > 0 ? `$${item.price.toLocaleString()}` : '—'}
            </span>
            <div className="flex gap-1 flex-shrink-0">
              {canSwap && (
                <button onClick={onSwap} className="px-2 py-0.5 border border-white/10 rounded text-[10px] font-bold hover:bg-white/5 transition-all">
                  Swap
                </button>
              )}
              <a href={item.buyUrl} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 bg-[#D3968C] text-white rounded text-[10px] font-bold hover:bg-[#c1867b] shadow transition-all whitespace-nowrap">
                Buy
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${shellClass} p-3 flex flex-col`} style={{ animationDelay: animDelay }} {...linkProps}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[#839958] font-bold text-[9px] uppercase tracking-widest truncate">{categoryLabel}</span>
        <span className="text-[8px] text-[#F7F4D5]/30 font-medium flex-shrink-0 ml-1">↔ floor plan</span>
      </div>

      <div className="w-full aspect-[4/3] bg-[#F7F4D5]/10 rounded-lg overflow-hidden shadow-inner relative mb-2">
        <img
          src={imgSrc}
          alt={item.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={() => setImgSrc(CATEGORY_FALLBACK[item.category] ?? '')}
        />
        <div className="absolute inset-0 bg-[#0A3323]/10" />
      </div>

      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {item.brand && (
          <span className="text-[#D3968C] font-bold text-[9px] uppercase tracking-widest truncate">{item.brand}</span>
        )}
        <h3 className="text-xs font-bold leading-snug line-clamp-2 overflow-hidden">{item.name}</h3>

        <div className="mt-auto pt-1.5 flex items-center justify-between gap-1 border-t border-[#F7F4D5]/10">
          <span className="text-sm font-bold flex-shrink-0">
            {item.price > 0 ? `$${item.price.toLocaleString()}` : '—'}
          </span>
          <div className="flex gap-1 flex-shrink-0">
            {canSwap && (
              <button
                onClick={onSwap}
                className="px-2 py-0.5 border border-white/10 rounded text-[10px] font-bold hover:bg-white/5 transition-all"
              >
                Swap
              </button>
            )}
            <a
              href={item.buyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-0.5 bg-[#D3968C] text-white rounded text-[10px] font-bold hover:bg-[#c1867b] shadow transition-all whitespace-nowrap"
            >
              Buy
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
