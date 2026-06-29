import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import type { Room, Style, FurnitureItem } from '../types';
import RoomSVG from '../components/RoomSVG';
import FurniturePanel from '../components/FurniturePanel';
import { orderedFurniture } from '../utils/furnitureLayout';

const FALLBACK_ROOM: Room = {
  roomId:   'fallback',
  name:     'Your Room',
  widthFt:  12,
  lengthFt: 14,
  heightFt: 8,
  sqft:     168,
};

export default function RoomResult() {
  const [room,             setRoom]             = useState<Room | null>(null);
  const [style,            setStyle]            = useState<Style | null>(null);
  const [furniture,        setFurniture]        = useState<FurnitureItem[]>([]);
  const [furnitureSlots,   setFurnitureSlots]   = useState<Record<string, FurnitureItem>>({});
  const [furnitureLoading, setFurnitureLoading] = useState(false);
  const [linkedCategory,   setLinkedCategory]   = useState<string | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState('');

  useEffect(() => {
    const init: Record<string, FurnitureItem> = {};
    furniture.forEach((item) => { if (!init[item.category]) init[item.category] = item; });
    setFurnitureSlots(init);
  }, [furniture]);

  const handleSwap = useCallback((category: string) => {
    const inCategory = furniture.filter((i) => i.category === category);
    if (inCategory.length < 2) return;
    setFurnitureSlots((prev) => {
      const current = prev[category];
      const idx     = inCategory.findIndex((i) => i.id === current?.id);
      const next    = inCategory[(idx + 1) % inCategory.length];
      return { ...prev, [category]: next };
    });
  }, [furniture]);

  useEffect(() => {
    const roomId = localStorage.getItem('blueprintCurrentRoomId');
    const userId = localStorage.getItem('blueprintUserId');
    const raw    = localStorage.getItem('blueprintStyleResult');

    if (!raw) {
      setError('No style analysis found. Go back and analyze your room first.');
      setLoading(false);
      return;
    }

    let parsedStyle: Style;
    try {
      const ai = JSON.parse(raw);
      parsedStyle = {
        styleTag:     ai.styleTag     ?? '',
        moodTags:     ai.moodTags     ?? [],
        colorPalette: ai.colorPalette ?? [],
        roomFeatures: ai.roomFeatures ?? [],
        confidence:   ai.confidence   ?? 0,
        budgetTotal:  0,
      };
      setStyle(parsedStyle);
    } catch {
      setError('Style data is corrupted. Please re-analyze your room.');
      setLoading(false);
      return;
    }

    if (!roomId || !userId) {
      setLoading(false);
      fetchFurniture(roomId ?? 'unknown', parsedStyle.styleTag);
      return;
    }

    Promise.all([
      fetch(`/api/rooms?userId=${userId}`)
        .then(r => r.json())
        .then((rooms: any[]) => {
          const match = rooms.find(r => r._id === roomId);
          if (match) {
            setRoom({
              roomId:   match._id,
              name:     match.name,
              widthFt:  match.widthFt,
              lengthFt: match.lengthFt,
              heightFt: match.heightFt,
              sqft:     match.sqft,
            });
          }
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));

    fetchFurniture(roomId, parsedStyle.styleTag);
  }, []);

  function fetchFurniture(roomId: string, styleTag: string) {
    setFurnitureLoading(true);
    fetch(`/api/rooms/${roomId}/furniture?styleTag=${encodeURIComponent(styleTag)}`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
      .then((items: FurnitureItem[]) => { setFurniture(items); })
      .catch((err) => { console.error('[furniture]', err); setFurniture([]); })
      .finally(() => setFurnitureLoading(false));
  }

  if (loading) {
    return (
      <div className="min-h-screen grid-background flex items-center justify-center">
        <p className="text-[#F7F4D5]/60 text-xl font-medium animate-pulse">Loading your room...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen grid-background flex flex-col items-center justify-center gap-6 p-8">
        <p className="text-[#D3968C] text-xl font-medium text-center">{error}</p>
        <a href="/inspo-upload.html" className="px-8 py-4 bg-[#D3968C] text-white rounded-2xl font-bold hover:bg-[#c1867b] transition-all">
          Analyze Style
        </a>
      </div>
    );
  }

  const s = style!;
  const layoutRoom = room ?? FALLBACK_ROOM;
  const layoutFurniture = orderedFurniture(furnitureSlots).length > 0
    ? orderedFurniture(furnitureSlots)
    : orderedFurniture(Object.fromEntries(furniture.map((item) => [item.category, item])));

  return (
    <div className="relative min-h-screen grid-background">
      <div className="noise-texture" />

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

        <header className="mb-8 animate-reveal" style={{ animationDelay: '0.3s' }}>
          <div className="flex items-baseline gap-4 mb-2">
            <span className="text-[#D3968C] font-bold tracking-widest uppercase text-sm">{s.styleTag} Style</span>
          </div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <h1 className="text-5xl md:text-6xl font-bold text-[#F7F4D5] tracking-tight">
                {layoutRoom.name}
              </h1>
              <p className="text-lg text-[#F7F4D5]/60 font-medium">
                {layoutRoom.widthFt}' x {layoutRoom.lengthFt}' <span className="mx-2 opacity-30">|</span> {layoutRoom.sqft} sqft
              </p>
            </div>
            <div className="flex gap-3">
              <button className="px-6 py-3 bg-[#105666] text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-[#156a7d] transition-all text-sm">
                <iconify-icon icon="ph:floppy-disk-duotone" />
                Save Layout
              </button>
              <button className="p-3 bg-white/5 border border-white/10 text-white rounded-2xl hover:bg-white/10 transition-all">
                <iconify-icon icon="ph:export-duotone" class="text-xl" />
              </button>
            </div>
          </div>
        </header>

        <FurniturePanel
          items={furniture}
          slots={furnitureSlots}
          onSwap={handleSwap}
          style={s}
          loading={furnitureLoading}
          linkedCategory={linkedCategory}
          onLinkCategory={setLinkedCategory}
          centerContent={
            <RoomSVG
              room={layoutRoom}
              style={s}
              furniture={layoutFurniture}
              linkedCategory={linkedCategory}
              onLinkCategory={setLinkedCategory}
            />
          }
        />

        <div className="grid md:grid-cols-3 gap-4 animate-reveal" style={{ animationDelay: '0.6s' }}>
          <div className="garden-card ghibli-border p-6">
            <h3 className="text-base font-bold mb-4 flex items-center gap-2">
              <iconify-icon icon="ph:palette-duotone" class="text-[#D3968C]" />
              Color Palette
            </h3>
            <div className="flex flex-wrap gap-3">
              {s.colorPalette.map((hex) => (
                <div
                  key={hex}
                  className="w-10 h-10 rounded-xl shadow transform hover:scale-110 transition-all cursor-help"
                  style={{ background: hex }}
                  title={hex}
                />
              ))}
            </div>
          </div>

          <div className="garden-card ghibli-border p-6">
            <h3 className="text-base font-bold mb-4 flex items-center gap-2">
              <iconify-icon icon="ph:cloud-sun-duotone" class="text-[#D3968C]" />
              Mood
            </h3>
            <div className="flex flex-wrap gap-2">
              {s.moodTags.map((tag) => (
                <span key={tag} className="mood-tag px-3 py-1.5 bg-[#105666]/30 rounded-full text-xs font-bold">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="garden-card ghibli-border p-6">
            <h3 className="text-base font-bold mb-4 flex items-center gap-2">
              <iconify-icon icon="ph:list-checks-duotone" class="text-[#D3968C]" />
              Room Features
            </h3>
            <ul className="space-y-2">
              {s.roomFeatures.map((feat) => (
                <li key={feat} className="flex items-center gap-2 text-[#F7F4D5]/80 text-sm font-medium">
                  <iconify-icon icon="ph:dot-bold" class="text-[#D3968C] flex-shrink-0" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>
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
