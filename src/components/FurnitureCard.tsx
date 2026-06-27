import { useState } from 'react';
import type { FurnitureItem } from '../types';

interface Props {
  item:      FurnitureItem;
  canSwap:   boolean;
  onSwap:    () => void;
  animDelay: string;
}

const CATEGORY_FALLBACK: Record<string, string> = {
  sofa:         'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=300',
  coffee_table: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&q=80&w=300',
  rug:          'https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=300',
  floor_lamp:   'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=300',
  accent_chair: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=300',
};

export default function FurnitureCard({ item, canSwap, onSwap, animDelay }: Props) {
  const [imgSrc, setImgSrc] = useState(item.imageUrl || CATEGORY_FALLBACK[item.category] || '');

  return (
    <div className="garden-card p-6 ghibli-border flex gap-8 group animate-reveal" style={{ animationDelay: animDelay }}>
      <div className="w-32 h-32 bg-[#F7F4D5]/10 rounded-3xl overflow-hidden shadow-inner flex-shrink-0 relative">
        <img
          src={imgSrc}
          alt={item.name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
          onError={() => setImgSrc(CATEGORY_FALLBACK[item.category] ?? '')}
        />
        <div className="absolute inset-0 bg-[#0A3323]/10" />
      </div>

      <div className="flex-1 flex flex-col justify-center">
        {item.brand && (
          <span className="text-[#D3968C] font-bold text-xs uppercase tracking-widest mb-1">{item.brand}</span>
        )}
        <h3 className="text-xl font-bold mb-4 leading-snug">{item.name}</h3>

        <div className="flex items-center justify-between">
          <span className="text-3xl font-bold">
            {item.price > 0 ? `$${item.price.toLocaleString()}` : '—'}
          </span>
          <div className="flex gap-3">
            {canSwap && (
              <button
                onClick={onSwap}
                className="px-6 py-2 border border-white/10 rounded-xl text-sm font-bold hover:bg-white/5 transition-all"
              >
                Swap
              </button>
            )}
            <a
              href={item.buyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-2 bg-[#D3968C] text-white rounded-xl text-sm font-bold hover:bg-[#c1867b] shadow-lg transition-all"
            >
              Buy Now
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
