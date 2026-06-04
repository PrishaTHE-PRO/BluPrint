import type { CSSProperties } from 'react';
import type { Room, Style, FurnitureItem } from '../types';

interface Props {
  room:      Room;
  style:     Style;
  furniture: FurnitureItem[];
}

// Absolute-position config per category (matches the design)
const FLOOR_POS: Record<string, CSSProperties> = {
  sofa:         { bottom: '15%', left: '50%', transform: 'translateX(-50%)', width: '60%',  height: '25%' },
  coffee_table: { bottom: '45%', left: '50%', transform: 'translateX(-50%)', width: '35%',  height: '12%' },
  floor_lamp:   { bottom: '15%', right: '10%',                               width: '8%',   height: '8%'  },
  side_table:   { bottom: '20%', left:  '10%',                               width: '12%',  height: '12%' },
};

const SHORT_LABEL: Record<string, string> = {
  sofa:         'KIVIK Sofa',
  coffee_table: 'LACK Table',
  floor_lamp:   '',
  side_table:   '',
};

export default function RoomSVG({ room, furniture }: Props) {
  return (
    <div className="garden-card ghibli-border p-8 animate-reveal" style={{ animationDelay: '0.4s' }}>
      <div className="relative aspect-square bg-[#F7F4D5] rounded-3xl overflow-hidden shadow-2xl" style={{ border: '12px solid rgba(10,51,35,0.05)' }}>

        {/* dashed inner border */}
        <div className="absolute inset-8 border border-[#0A3323]/10 border-dashed pointer-events-none" />

        {/* dimension labels */}
        <div className="absolute left-2 top-1/2 text-[10px] text-[#0A3323]/40 font-bold rotate-90" style={{ transform: 'translateY(-50%) rotate(-90deg)' }}>
          {room.lengthFt} ft
        </div>
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-[#0A3323]/40 font-bold">
          {room.widthFt} ft
        </div>

        {/* rug outline (dashed, no hover) */}
        <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[75%] h-[40%] border-2 border-[#D3968C]/30 border-dashed rounded-lg pointer-events-none" />

        {/* furniture pieces */}
        {furniture
          .filter((item) => item.category !== 'rug')
          .map((item) => {
            const pos = FLOOR_POS[item.category];
            if (!pos) return null;

            const isRound = item.category === 'floor_lamp' || item.category === 'side_table';
            const label   = SHORT_LABEL[item.category] ?? '';

            return (
              <div
                key={item.id}
                className="map-furniture absolute flex items-center justify-center"
                style={{
                  ...pos,
                  background:   isRound ? '#9B9482' : '#D2C9B1',
                  borderRadius: isRound ? '50%' : '0.75rem',
                  border:       '2px solid rgba(10,51,35,0.05)',
                  boxShadow:    '0 2px 8px rgba(0,0,0,0.1)',
                }}
              >
                {label && (
                  <span className="text-[8px] font-bold text-[#0A3323]/30 uppercase tracking-tight text-center px-1">
                    {label}
                  </span>
                )}
              </div>
            );
          })}

        {/* plant decoration */}
        <div className="map-furniture absolute top-[15%] right-[15%] w-[8%] h-[8%] bg-[#839958] rounded-full shadow-lg" />
      </div>
    </div>
  );
}
