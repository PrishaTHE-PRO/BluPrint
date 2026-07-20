import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import type { Room, Style, FurnitureItem, RoomArchitectureLayout } from '../types';
import RoomSVG from '../components/RoomSVG';
import FurniturePanel from '../components/FurniturePanel';
import { buildRoomFromLayout, readSavedRoomLayout, saveRoomLayout } from '../utils/roomLayout';
import { orderedFurniture } from '../utils/furnitureLayout';

const FALLBACK_ROOM: Room = {
  roomId:   'fallback',
  name:     localStorage.getItem('blueprintCurrentRoomName') ?? 'My Room',
  widthFt:  Number(localStorage.getItem('blueprintCurrentRoomWidth'))  || 12,
  lengthFt: Number(localStorage.getItem('blueprintCurrentRoomLength')) || 14,
  heightFt: Number(localStorage.getItem('blueprintCurrentRoomHeight')) || 8,
  sqft:     (Number(localStorage.getItem('blueprintCurrentRoomWidth')) || 12) *
            (Number(localStorage.getItem('blueprintCurrentRoomLength')) || 14),
};

function isRoomArchitectureLayout(value: unknown): value is RoomArchitectureLayout {
  return !!value
    && typeof value === 'object'
    && Array.isArray((value as RoomArchitectureLayout).roomPoints)
    && Array.isArray((value as RoomArchitectureLayout).elements)
    && Array.isArray((value as RoomArchitectureLayout).cutouts);
}

function readScopedSavedRoomLayout() {
  const layout = readSavedRoomLayout();
  const roomId = localStorage.getItem('blueprintCurrentRoomId');

  if (!layout) return null;
  if (layout.roomId && layout.roomId !== roomId) return null;
  return layout;
}

export default function RoomResult() {
  const [room,             setRoom]             = useState<Room | null>(null);
  const [savedLayout,      setSavedLayout]      = useState<RoomArchitectureLayout | null>(() => readScopedSavedRoomLayout());
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
    let roomType = '';
    try {
      const ai = JSON.parse(raw);
      const rawRoomType = ai.roomType;
      const fallbackRoomType = localStorage.getItem('blueprintCurrentRoomType');
      roomType = String(rawRoomType ?? fallbackRoomType ?? '').trim();
      parsedStyle = {
        styleTag:     ai.styleTag     ?? '',
        roomType,
        moodTags:     ai.moodTags     ?? [],
        colorPalette: ai.colorPalette ?? [],
        roomFeatures: ai.roomFeatures ?? [],
        confidence:   ai.confidence   ?? 0,
        budgetTotal:  Number(ai.budgetTotal ?? localStorage.getItem('blueprintBudgetTotal')) || 0,
      };
      setStyle(parsedStyle);
    } catch {
      setError('Style data is corrupted. Please re-analyze your room.');
      setLoading(false);
      return;
    }

    if (!roomId || !userId) {
      setLoading(false);
      fetchFurniture(roomId ?? 'unknown', parsedStyle.styleTag, roomType);
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

            if (isRoomArchitectureLayout(match.layout)) {
              setSavedLayout(match.layout);
              saveRoomLayout(match.layout);
            }
          }
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));

    fetchFurniture(roomId, parsedStyle.styleTag, roomType);
  }, []);

  function fetchFurniture(roomId: string, styleTag: string, roomType = '') {
    const url = `/api/rooms/${roomId}/furniture?styleTag=${encodeURIComponent(styleTag)}&roomType=${encodeURIComponent(roomType)}`;
    setFurnitureLoading(true);
    fetch(url)
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
  const layoutRoom = buildRoomFromLayout(savedLayout, room ?? FALLBACK_ROOM);
  const layoutFurniture = orderedFurniture(furnitureSlots, s.roomType).length > 0
    ? orderedFurniture(furnitureSlots, s.roomType)
    : orderedFurniture(
        Object.fromEntries(furniture.map((item) => [item.category, item])),
        s.roomType,
      );

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

      <nav className="app-nav sticky top-0 z-50">
        <a href="/dashboard.html" className="app-brand">
          <div className="w-12 h-12 bg-[#0A3323] rounded-[1.2rem] flex items-center justify-center">
            <iconify-icon icon="ph:sparkle-duotone" class="text-3xl text-[#F7F4D5]" />
          </div>
          <span className="text-3xl font-bold tracking-tighter text-[#0A3323]" style={{ fontFamily: 'Crimson Pro, serif' }}>BluPrint</span>
        </a>
        <div className="app-nav-links">
          <a href="/dashboard.html" className="relative font-bold text-lg hover:opacity-70 transition-all">
            <iconify-icon icon="ph:house-duotone" /> Home
          </a>
          <a href="/past-inspiration.html" className="relative font-bold text-lg hover:opacity-70 transition-all">
            <iconify-icon icon="ph:squares-four-duotone" /> Projects
          </a>
        </div>
        <div className="app-nav-actions">
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
              <p className="text-lg text-[#F7F4D5] font-medium">
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
          roomType={s.roomType}
          loading={furnitureLoading}
          linkedCategory={linkedCategory}
          onLinkCategory={setLinkedCategory}
          centerContent={
            <RoomSVG
              room={layoutRoom}
              style={s}
              furniture={layoutFurniture}
              roomLayout={savedLayout}
              linkedCategory={linkedCategory}
              onLinkCategory={setLinkedCategory}
            />
          }
        />

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
