import type { CSSProperties } from 'react';
import { MOCK_FURNITURE, MOCK_ROOM, MOCK_STYLE } from '../mocks/roomData';
import RoomSVG from '../components/RoomSVG';
import FurniturePanel from '../components/FurniturePanel';

export default function RoomResult() {
  // Later: replace with real API calls
  const room      = MOCK_ROOM;
  const style     = MOCK_STYLE;
  const furniture = MOCK_FURNITURE;

  return (
    <div className="relative min-h-screen grid-background">
      <div className="noise-texture" />

      {/* floating particles */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {([
          { top: '20%', left: '10%', d: '7s',  size: 'w-2 h-2', color: 'bg-[#F7F4D5]/20' },
          { top: '60%', left: '15%', d: '11s', size: 'w-3 h-3', color: 'bg-[#D3968C]/10' },
          { top: '80%', left: '80%', d: '9s',  size: 'w-2 h-2', color: 'bg-[#F7F4D5]/20' },
          { top: '40%', left: '90%', d: '13s', size: 'w-1 h-1', color: 'bg-white/30'      },
        ] as Array<{ top: string; left: string; d: string; size: string; color: string }>).map((p, i) => (
          <div
            key={i}
            className={`particle ${p.size} ${p.color} rounded-full`}
            style={{ top: p.top, left: p.left, '--d': p.d } as CSSProperties}
          />
        ))}
      </div>

      {/* nav */}
      <nav className="sticky top-0 z-50 px-8 py-5 flex items-center justify-between border-b border-[#F7F4D5]/10 shadow-lg" style={{ backgroundColor: 'var(--nav-pink)' }}>
        <div className="flex items-center gap-4 animate-reveal" style={{ animationDelay: '0.1s' }}>
          <a href="/dashboard.html" className="w-12 h-12 bg-[#0A3323] rounded-[1.2rem] flex items-center justify-center transform transition hover:rotate-12 cursor-pointer">
            <iconify-icon icon="ph:sparkle-duotone" class="text-3xl text-[#F7F4D5]" />
          </a>
          <span className="text-3xl font-bold tracking-tighter text-[#0A3323]" style={{ fontFamily: 'Crimson Pro, serif' }}>BluPrint</span>
        </div>
        <div className="hidden md:flex items-center gap-12 text-[#0A3323] animate-reveal" style={{ animationDelay: '0.2s' }}>
          <a href="/dashboard.html" className="relative font-bold text-lg hover:opacity-70 transition-all">Dashboard</a>
          <a href="#" className="relative font-bold text-lg hover:opacity-70 transition-all">Gallery</a>
          <a href="#" className="relative font-bold text-lg hover:opacity-70 transition-all">Community</a>
          <div className="w-12 h-12 rounded-full bg-[#0A3323]/10 flex items-center justify-center border-2 border-[#0A3323]/20 hover:bg-[#0A3323]/20 transition-all shadow-sm cursor-pointer">
            <iconify-icon icon="ph:user-duotone" class="text-2xl text-[#0A3323]" />
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-[1600px] mx-auto p-8 lg:p-12">

        {/* page header */}
        <header className="mb-12 animate-reveal" style={{ animationDelay: '0.3s' }}>
          <div className="flex items-baseline gap-4 mb-2">
            <span className="text-[#D3968C] font-bold tracking-widest uppercase text-sm">{style.styleTag} Style</span>
            <span className="text-[#F7F4D5]/40 text-sm font-medium">•</span>
            <span className="text-[#839958] font-bold text-sm">{Math.round(style.confidence * 100)}% AI Confidence</span>
          </div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <h1 className="text-6xl md:text-7xl font-bold text-[#F7F4D5] tracking-tight">{room.name}</h1>
              <p className="text-xl text-[#F7F4D5]/60 font-medium">
                {room.widthFt}' x {room.lengthFt}' <span className="mx-2 opacity-30">|</span> {room.sqft} sqft
              </p>
            </div>
            <div className="flex gap-3">
              <button className="px-8 py-4 bg-[#105666] text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-[#156a7d] transition-all">
                <iconify-icon icon="ph:floppy-disk-duotone" />
                Save Layout
              </button>
              <button className="p-4 bg-white/5 border border-white/10 text-white rounded-2xl hover:bg-white/10 transition-all">
                <iconify-icon icon="ph:export-duotone" class="text-2xl" />
              </button>
            </div>
          </div>
        </header>

        <div className="grid lg:grid-cols-12 gap-12">

          {/* left column */}
          <div className="lg:col-span-5 flex flex-col gap-10">

            {/* 2D floor map */}
            <RoomSVG room={room} style={style} furniture={furniture} />

            {/* color palette + mood row */}
            <div className="grid md:grid-cols-2 gap-8">
              <div className="garden-card ghibli-border p-8 animate-reveal" style={{ animationDelay: '0.5s' }}>
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <iconify-icon icon="ph:palette-duotone" class="text-[#D3968C]" />
                  Color Palette
                </h3>
                <div className="flex flex-wrap gap-4">
                  {style.colorPalette.map((hex) => (
                    <div
                      key={hex}
                      className="w-12 h-12 rounded-2xl shadow-lg transform hover:scale-110 transition-all cursor-help"
                      style={{ background: hex }}
                      title={hex}
                    />
                  ))}
                </div>
              </div>

              <div className="garden-card ghibli-border p-8 animate-reveal" style={{ animationDelay: '0.6s' }}>
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <iconify-icon icon="ph:cloud-sun-duotone" class="text-[#D3968C]" />
                  Mood
                </h3>
                <div className="flex flex-wrap gap-3">
                  {style.moodTags.map((tag) => (
                    <span key={tag} className="mood-tag px-4 py-2 bg-[#105666]/30 rounded-full text-xs font-bold">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* room features */}
            <div className="garden-card ghibli-border p-8 animate-reveal" style={{ animationDelay: '0.7s' }}>
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <iconify-icon icon="ph:list-checks-duotone" class="text-[#D3968C]" />
                Room Features
              </h3>
              <ul className="space-y-4">
                {style.roomFeatures.map((feat) => (
                  <li key={feat} className="flex items-center gap-3 text-[#F7F4D5]/80 font-medium group">
                    <iconify-icon icon="ph:dot-bold" class="text-[#D3968C] transition-transform group-hover:scale-150" />
                    {feat}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* right column — furniture panel */}
          <FurniturePanel items={furniture} style={style} />
        </div>
      </main>

      <footer className="relative z-10 py-16 flex flex-col items-center gap-6 opacity-40">
        <div className="w-12 h-12 flex items-center justify-center bg-[#839958]/20 rounded-full">
          <iconify-icon icon="ph:house-line-duotone" class="text-2xl text-[#839958]" />
        </div>
        <p className="text-xs tracking-[0.3em] uppercase font-bold text-[#F7F4D5]">Designed with Serenity • BluPrint Room Planner</p>
      </footer>
    </div>
  );
}
