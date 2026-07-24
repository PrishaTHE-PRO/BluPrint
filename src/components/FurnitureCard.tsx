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
  inRoom:           boolean;
  onToggleInRoom:   () => void;
}

const BUY_BTN_CLASS =
  'buy-btn group relative inline-flex items-center justify-center overflow-hidden ' +
  'bg-[#D3968C] text-white font-bold shadow transition-colors hover:bg-[#c1867b] whitespace-nowrap';

function BuyButton({ href, className = '' }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${BUY_BTN_CLASS} ${className}`.trim()}
    >
      <span className="inline-block transition-transform duration-300 ease-out group-hover:-translate-x-1.5">
        Buy
      </span>
      <svg
        className="pointer-events-none absolute right-1.5 size-[0.7em] opacity-0 translate-x-1 transition-all duration-300 ease-out group-hover:opacity-100 group-hover:translate-x-0"
        fill="none"
        viewBox="0 0 10 10"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}

const CATEGORY_FALLBACK: Record<string, string> = {
  sofa:         'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=400',
  coffee_table: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&q=80&w=400',
  rug:          'https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=400',
  floor_lamp:   'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=400',
  accent_chair: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=400',
  side_table:   'https://images.unsplash.com/photo-1532372320572-cda25653a26d?auto=format&fit=crop&q=80&w=400',
  bed:          'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&q=80&w=400',
  nightstand:   'https://images.unsplash.com/photo-1615529328331-f8917597711f?auto=format&fit=crop&q=80&w=400',
  dresser:      'https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=400',
  bedroom_rug:  'https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=400',
  wardrobe:     'https://images.unsplash.com/photo-1558997519-83ea9252edf8?auto=format&fit=crop&q=80&w=400',
  bedside_lamp: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=400',
  island_cart:  'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&q=80&w=400',
  bar_stool:    'https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&q=80&w=400',
  kitchen_rug:  'https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=400',
  kitchen_storage: 'https://images.unsplash.com/photo-1558997519-83ea9252edf8?auto=format&fit=crop&q=80&w=400',
  kitchen_shelf:   'https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=400',
  pendant_light:   'https://images.unsplash.com/photo-1524484485831-a92ffc0de03f?auto=format&fit=crop&q=80&w=400',
  vanity:          'https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&q=80&w=400',
  bath_mirror:     'https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&q=80&w=400',
  bath_storage:    'https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=400',
  bath_mat:        'https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=400',
  bath_light:      'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=400',
  shower_curtain:  'https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&q=80&w=400',
  desk:            'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&q=80&w=400',
  office_chair:    'https://images.unsplash.com/photo-1505843490701-5be5d0b19d58?auto=format&fit=crop&q=80&w=400',
  bookshelf:       'https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=400',
  desk_lamp:       'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=400',
  storage_cabinet: 'https://images.unsplash.com/photo-1558997519-83ea9252edf8?auto=format&fit=crop&q=80&w=400',
  monitor_stand:   'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&q=80&w=400',
  dining_table:    'https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&q=80&w=400',
  dining_chair:    'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=400',
  dining_rug:      'https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=400',
  sideboard:       'https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=400',
  dining_light:    'https://images.unsplash.com/photo-1524484485831-a92ffc0de03f?auto=format&fit=crop&q=80&w=400',
  bar_cabinet:     'https://images.unsplash.com/photo-1558997519-83ea9252edf8?auto=format&fit=crop&q=80&w=400',
  crib:            'https://images.unsplash.com/photo-1616627561839-074385245ff6?auto=format&fit=crop&q=80&w=400',
  nursery_dresser: 'https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=400',
  rocking_chair:   'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=400',
  nursery_rug:     'https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=400',
  nursery_shelf:   'https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=400',
  nursery_lamp:    'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=400',
};

export default function FurnitureCard({
  item,
  canSwap,
  onSwap,
  animDelay,
  variant = 'featured',
  linkedCategory,
  onLinkCategory,
  inRoom,
  onToggleInRoom,
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
    'garden-card rounded-2xl border group animate-reveal transition-all duration-200',
    inRoom ? 'border-[#F7F4D5]/10' : 'border-dashed border-[#F7F4D5]/25',
    isLinked ? 'ring-2 ring-[#D3968C] ring-offset-2 ring-offset-[#0A3323] scale-[1.02]' : '',
    isDimmed ? 'opacity-40' : inRoom ? 'opacity-100' : 'opacity-70',
  ].join(' ');

  const inRoomToggle = (
    <button
      type="button"
      onClick={onToggleInRoom}
      title={inRoom ? 'Remove from floor plan' : 'Add back to floor plan'}
      className={[
        'flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold transition-all flex-shrink-0',
        inRoom
          ? 'text-[#F7F4D5]/40 hover:text-[#D3968C] hover:bg-white/5'
          : 'text-[#839958] bg-[#839958]/15 hover:bg-[#839958]/30 hover:text-[#F7F4D5]',
      ].join(' ')}
    >
      <iconify-icon icon={inRoom ? 'ph:minus-circle-duotone' : 'ph:plus-circle-duotone'} />
      {inRoom ? 'Remove' : 'Add'}
    </button>
  );

  if (variant === 'compact') {
    return (
      <div className={`${shellClass} p-4 flex gap-4 items-stretch`} style={{ animationDelay: animDelay }} {...linkProps}>
        <div className="w-28 h-28 bg-[#F7F4D5]/10 rounded-2xl overflow-hidden shadow-inner flex-shrink-0 relative">
          <img
            key={`${item.id}-${item.imageUrl || ''}`}
            src={imgSrc}
            alt={item.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            onError={() => setImgSrc(CATEGORY_FALLBACK[item.category] ?? '')}
          />
        </div>
        <div className="flex-1 flex flex-col justify-between min-w-0 py-1">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-1">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#839958] truncate">
                {categoryLabel}{item.brand ? ` · ${item.brand}` : ''}
              </p>
              {inRoomToggle}
            </div>
            <h3 className="text-base font-bold leading-snug line-clamp-2 mt-1.5">{item.name}</h3>
          </div>
          <div className="flex items-center justify-between gap-2 mt-3">
            <span className="text-lg font-bold text-[#F7F4D5] flex-shrink-0">
              {item.price > 0 ? `$${item.price.toLocaleString()}` : '—'}
            </span>
            <div className="flex gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={onSwap}
                disabled={!canSwap}
                title={canSwap ? 'Try another product' : 'No other options yet'}
                className="px-3 py-1.5 border border-white/10 rounded-lg text-xs font-bold hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                Swap
              </button>
              <BuyButton href={item.buyUrl} className="px-3 py-1.5 rounded-lg text-xs min-w-[3.25rem]" />
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
        {inRoomToggle}
      </div>

      <div className="w-full aspect-[4/3] bg-[#F7F4D5]/10 rounded-lg overflow-hidden shadow-inner relative mb-2">
        <img
          key={`${item.id}-${item.imageUrl || ''}`}
          src={imgSrc}
          alt={item.name}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={() => setImgSrc(CATEGORY_FALLBACK[item.category] ?? '')}
        />
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
            <button
              type="button"
              onClick={onSwap}
              disabled={!canSwap}
              title={canSwap ? 'Try another product' : 'No other options yet'}
              className="px-2 py-0.5 border border-white/10 rounded text-[10px] font-bold hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              Swap
            </button>
            <BuyButton href={item.buyUrl} className="px-2.5 py-0.5 rounded text-[10px] min-w-[2.75rem]" />
          </div>
        </div>
      </div>
    </div>
  );
}
