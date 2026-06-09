import { useState } from 'react';
import type { FurnitureItem } from '../types';

interface Props {
  item:      FurnitureItem;
  allItems:  FurnitureItem[];
  onSwap:    (next: FurnitureItem) => void;
  animDelay: string;
}

// IKEA/Wayfair images are hotlink-protected — use Unsplash fallbacks by category
const FALLBACK: Record<string, string> = {
  sofa:         'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=300',
  coffee_table: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&q=80&w=300',
  rug:          'https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=300',
  floor_lamp:   'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=300',
  side_table:   'https://images.unsplash.com/photo-1565791380713-1756b9a05343?auto=format&fit=crop&q=80&w=300',
};

export default function FurnitureCard({ item, allItems, onSwap, animDelay }: Props) {
  const [imgSrc, setImgSrc] = useState(FALLBACK[item.category] ?? item.imageUrl);

  const currentIndex = allItems.findIndex((f) => f.id === item.id);
  const dims = `${(item.widthIn / 12).toFixed(1)}' W x ${(item.depthIn / 12).toFixed(1)}' D`;

  function handleSwap() {
    const next = allItems[(currentIndex + 1) % allItems.length];
    setImgSrc(FALLBACK[next.category] ?? next.imageUrl);
    onSwap(next);
  }

  return (
    <div className="garden-card p-6 ghibli-border flex gap-8 group animate-reveal" style={{ animationDelay: animDelay }}>
      {/* image */}
      <div className="w-32 h-32 bg-[#F7F4D5] rounded-3xl overflow-hidden shadow-inner flex-shrink-0 relative">
        <img
          src={imgSrc}
          alt={item.name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
          onError={() => setImgSrc(FALLBACK[item.category] ?? '')}
        />
        <div className="absolute inset-0 bg-[#0A3323]/10" />
      </div>

      {/* info */}
      <div className="flex-1 flex flex-col justify-center">
        <span className="text-[#D3968C] font-bold text-xs uppercase tracking-widest mb-1">{item.brand}</span>
        <h3 className="text-2xl font-bold mb-1">{item.name}</h3>
        <p className="text-sm text-[#F7F4D5]/40 font-medium mb-4">{dims}</p>

        <div className="flex items-center justify-between">
          <span className="text-3xl font-bold">${item.price}</span>
          <div className="flex gap-3">
            <button
              onClick={handleSwap}
              className="px-6 py-2 border border-white/10 rounded-xl text-sm font-bold hover:bg-white/5 transition-all"
            >
              Swap
            </button>
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
