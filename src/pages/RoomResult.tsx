import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { Room, Style, FurnitureItem, RoomArchitectureLayout } from '../types';
import RoomSVG from '../components/RoomSVG';
import type { Placement } from '../components/RoomSVG';
import FurniturePanel from '../components/FurniturePanel';
import { buildRoomFromLayout, readSavedRoomLayout, saveRoomLayout } from '../utils/roomLayout';
import { orderedFurniture } from '../utils/furnitureLayout';
import {
  buildFurniturePlacement,
  normalizeFurniturePlacement,
  readPlacement,
  readSavedFurniturePlacement,
  saveFurniturePlacementLocally,
} from '../utils/furniturePlacement';
import type { FurniturePlacement } from '../utils/furniturePlacement';

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

function readScopedSavedFurniturePlacement() {
  const placement = readSavedFurniturePlacement();
  const roomId    = localStorage.getItem('blueprintCurrentRoomId');

  if (!placement) return null;
  if (placement.roomId && placement.roomId !== roomId) return null;
  return placement;
}

export default function RoomResult() {
  const [room,             setRoom]             = useState<Room | null>(null);
  const [savedLayout,      setSavedLayout]      = useState<RoomArchitectureLayout | null>(() => readScopedSavedRoomLayout());
  const [style,            setStyle]            = useState<Style | null>(null);
  const [furniture,        setFurniture]        = useState<FurnitureItem[]>([]);
  const [furnitureSlots,   setFurnitureSlots]   = useState<Record<string, FurnitureItem>>({});
  const [furnitureLoading, setFurnitureLoading] = useState(false);
  const [linkedCategory,   setLinkedCategory]   = useState<string | null>(null);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState('');
  const [savedPlacement,   setSavedPlacement]   = useState<FurniturePlacement | null>(() => readScopedSavedFurniturePlacement());
  const [saveStatus,       setSaveStatus]       = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Live positions/rotations from RoomSVG. Held in a ref, not state — dragging
  // fires this on every pointer move and re-rendering the page would stutter.
  const placementRef = useRef<Placement>({ positions: {}, rotations: {} });
  const restoredRef  = useRef(false);

  const handlePlacementChange = useCallback((placement: Placement) => {
    placementRef.current = placement;
  }, []);

  // Compose the slots from the fresh search, then overlay anything the user
  // saved. The two arrive independently, so this runs whenever either lands.
  useEffect(() => {
    // A saved layout carries full products, so it can render on its own even if
    // the furniture search failed or returned nothing.
    if (furniture.length === 0 && !savedPlacement) return;

    const init: Record<string, FurnitureItem> = {};
    furniture.forEach((item) => { if (!init[item.category]) init[item.category] = item; });

    if (savedPlacement) {
      const restored = readPlacement(savedPlacement);
      // The saved product always wins over whatever the search returned this
      // time — search ids are positional, so "the same id" is a different sofa.
      Object.assign(init, restored.slots);

      // Removed pieces and placement only need seeding once; re-applying them
      // would undo edits the user made after the restore.
      if (!restoredRef.current) {
        restoredRef.current = true;
        setHiddenCategories(restored.hidden);
        placementRef.current = { positions: restored.positions, rotations: restored.rotations };
      }
    } else if (!restoredRef.current) {
      setHiddenCategories(new Set());
    }

    setFurnitureSlots(init);
  }, [furniture, savedPlacement]);

  const initialPlacement = useMemo<Placement | null>(() => {
    if (!savedPlacement) return null;
    const { positions, rotations } = readPlacement(savedPlacement);
    return { positions, rotations };
  }, [savedPlacement]);

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

  /** Take a piece off the floor plan. Its sidebar card stays so it can be added back. */
  const handleRemoveFromRoom = useCallback((category: string) => {
    setHiddenCategories((prev) => new Set(prev).add(category));
    // Drop the hover link — otherwise it points at a piece that's no longer drawn.
    setLinkedCategory((prev) => (prev === category ? null : prev));
  }, []);

  const handleToggleInRoom = useCallback((category: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (!next.delete(category)) next.add(category);
      return next;
    });
    setLinkedCategory((prev) => (prev === category ? null : prev));
  }, []);

  const handleSaveLayout = useCallback(async () => {
    const roomId = localStorage.getItem('blueprintCurrentRoomId');
    const placement = buildFurniturePlacement({
      roomId,
      slots:     furnitureSlots,
      hidden:    hiddenCategories,
      positions: placementRef.current.positions,
      rotations: placementRef.current.rotations,
    });

    // Save locally first so the layout survives even if the request fails.
    saveFurniturePlacementLocally(placement);
    setSaveStatus('saving');

    if (!roomId) {
      setSaveStatus('saved');
      return;
    }

    try {
      const res = await fetch(`/api/rooms/${roomId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ furnitureLayout: placement }),
      });
      if (!res.ok) throw new Error(`save failed (${res.status})`);
      setSaveStatus('saved');
    } catch (err) {
      console.error('[save layout]', err);
      setSaveStatus('error');
    }
  }, [furnitureSlots, hiddenCategories]);

  useEffect(() => {
    if (saveStatus !== 'saved' && saveStatus !== 'error') return;
    const timer = setTimeout(() => setSaveStatus('idle'), 2500);
    return () => clearTimeout(timer);
  }, [saveStatus]);

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

            // Server placement is authoritative, but don't clobber a local one
            // that has already been applied to the canvas.
            const serverPlacement = normalizeFurniturePlacement(match.furnitureLayout);
            if (serverPlacement && !restoredRef.current) {
              setSavedPlacement(serverPlacement);
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
  const slottedFurniture = orderedFurniture(furnitureSlots, s.roomType);
  const placeableFurniture = slottedFurniture.length > 0
    ? slottedFurniture
    : orderedFurniture(
        Object.fromEntries(furniture.map((item) => [item.category, item])),
        s.roomType,
      );
  // The floor plan shows only what's currently placed; the sidebar keeps every card.
  const layoutFurniture = placeableFurniture.filter((item) => !hiddenCategories.has(item.category));

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

      {/* Workflow stepper — lets the user step back to change the room or their
          preferences and re-analyze. Those pages restore prior input on load. */}
      <nav className="workflow-steps" aria-label="Room design progress">
        <a className="workflow-step completed" href="/room-dimensions.html" aria-label="Back to Define Room">
          <span><iconify-icon icon="ph:check-bold" /></span>
          <strong>Define Room</strong>
        </a>
        <div className="workflow-connector completed" />
        <a className="workflow-step completed" href="/inspo-upload.html" aria-label="Back to Add Inspiration">
          <span><iconify-icon icon="ph:check-bold" /></span>
          <strong>Add Inspiration</strong>
        </a>
        <div className="workflow-connector completed" />
        <div className="workflow-step active" aria-current="step">
          <span>3</span>
          <strong>View Design</strong>
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
              <button
                onClick={handleSaveLayout}
                disabled={saveStatus === 'saving'}
                className={[
                  'px-6 py-3 text-white rounded-2xl font-bold flex items-center gap-2 transition-all text-sm',
                  saveStatus === 'error' ? 'bg-[#D3968C] hover:bg-[#c1867b]' : 'bg-[#105666] hover:bg-[#156a7d]',
                  saveStatus === 'saving' ? 'opacity-70 cursor-wait' : '',
                ].join(' ')}
              >
                <iconify-icon icon={
                  saveStatus === 'saved' ? 'ph:check-circle-duotone'
                  : saveStatus === 'error' ? 'ph:warning-circle-duotone'
                  : 'ph:floppy-disk-duotone'
                } />
                {saveStatus === 'saving' ? 'Saving...'
                  : saveStatus === 'saved' ? 'Saved'
                  : saveStatus === 'error' ? 'Retry Save'
                  : 'Save Layout'}
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
          hiddenCategories={hiddenCategories}
          onToggleInRoom={handleToggleInRoom}
          centerContent={
            <RoomSVG
              room={layoutRoom}
              style={s}
              furniture={layoutFurniture}
              roomLayout={savedLayout}
              linkedCategory={linkedCategory}
              onLinkCategory={setLinkedCategory}
              onRemove={handleRemoveFromRoom}
              initialPlacement={initialPlacement}
              onPlacementChange={handlePlacementChange}
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
