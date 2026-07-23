import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { Room, Style, FurnitureItem, RoomArchitectureLayout } from '../types';
import RoomSVG from '../components/RoomSVG';
import type { Placement } from '../components/RoomSVG';
import FurniturePanel from '../components/FurniturePanel';
import IsoRoomPreview from '../components/IsoRoomPreview';
import type { IsoFurnitureEntry, IsoRoomInput } from '../utils/isoRoomRender';
import { Link000 } from '@/components/ui/skiper-ui/skiper40';
import ProfileMenu from '../components/ProfileMenu';
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
import { resolveFurnitureColors, paletteFallback, colorFromName } from '../utils/furnitureColor';

const EMPTY_PLACEMENT: Placement = { positions: {}, rotations: {}, scales: {} };
const ISO_THROTTLE_MS = 70;

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

function roomFeatureSignature(features: string[] = []) {
  return [...features]
    .map((feature) => feature.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
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
  const [renamedName,      setRenamedName]      = useState<string | null>(null);
  const [editingName,      setEditingName]      = useState(false);
  const [nameDraft,        setNameDraft]        = useState('');

  // Live positions/rotations from RoomSVG. Held in a ref for saves, plus a
  // throttled state copy so the isometric preview can follow without stuttering.
  const placementRef = useRef<Placement>({ ...EMPTY_PLACEMENT });
  const [livePlacement, setLivePlacement] = useState<Placement>({ ...EMPTY_PLACEMENT });
  const [colorByCategory, setColorByCategory] = useState<Record<string, string>>({});
  const colorSourceIdsRef = useRef<Record<string, string>>({});
  const isoThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredRef  = useRef(false);

  const handlePlacementChange = useCallback((placement: Placement) => {
    placementRef.current = placement;
    if (isoThrottleRef.current) clearTimeout(isoThrottleRef.current);
    isoThrottleRef.current = setTimeout(() => {
      setLivePlacement({
        positions: { ...placement.positions },
        rotations: { ...placement.rotations },
        scales: { ...placement.scales },
      });
      isoThrottleRef.current = null;
    }, ISO_THROTTLE_MS);
  }, []);

  const lastPersistedRef = useRef<string>('');

  const persistPlacement = useCallback((opts?: { toServer?: boolean; updateState?: boolean }) => {
    if (!style || Object.keys(furnitureSlots).length === 0) return null;
    const placement = buildFurniturePlacement({
      roomId: localStorage.getItem('blueprintCurrentRoomId'),
      styleTag: style.styleTag,
      budgetTotal: style.budgetTotal,
      roomFeatures: style.roomFeatures,
      slots: furnitureSlots,
      hidden: hiddenCategories,
      positions: placementRef.current.positions,
      rotations: placementRef.current.rotations,
      scales: placementRef.current.scales,
      colors: colorByCategory,
    });

    // Skip no-op writes so dashboard previews stay in sync without spamming PATCH.
    const signature = JSON.stringify({
      items: placement.items.map((entry) => ({
        category: entry.category,
        color: entry.color || (entry.item as FurnitureItem & { color?: string }).color || null,
        hidden: entry.hidden,
        x: entry.x,
        y: entry.y,
        rotation: entry.rotation,
        scale: entry.scale,
        id: entry.item?.id,
      })),
      styleTag: placement.styleTag,
      budgetTotal: placement.budgetTotal,
    });
    if (signature === lastPersistedRef.current && !opts?.updateState) {
      return placement;
    }
    lastPersistedRef.current = signature;

    saveFurniturePlacementLocally(placement);
    if (opts?.updateState) setSavedPlacement(placement);

    if (opts?.toServer !== false) {
      const roomId = localStorage.getItem('blueprintCurrentRoomId');
      if (roomId) {
        fetch(`/api/rooms/${roomId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ furnitureLayout: placement }),
        }).catch((err) => console.warn('[persist furniture colors]', err));
      }
    }
    return placement;
  }, [style, furnitureSlots, hiddenCategories, colorByCategory]);

  // Keep product colors on the saved layout so dashboard / projects previews match the result page.
  useEffect(() => {
    if (!style || Object.keys(furnitureSlots).length === 0) return;
    if (Object.keys(colorByCategory).length === 0) return;
    const timer = setTimeout(() => {
      persistPlacement({ toServer: true });
    }, 900);
    return () => clearTimeout(timer);
  }, [colorByCategory, furnitureSlots, hiddenCategories, livePlacement, style, persistPlacement]);

  useEffect(() => {
    const flush = () => { persistPlacement({ toServer: true }); };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [persistPlacement]);

  useEffect(() => () => {
    if (isoThrottleRef.current) clearTimeout(isoThrottleRef.current);
  }, []);

  // A saved layout only applies while the room is still in the style it was
  // arranged under. Once the user re-analyzes into a different style, the saved
  // furniture no longer matches — drop it so the fresh search shows through.
  const activePlacement = useMemo<FurniturePlacement | null>(() => {
    if (!savedPlacement) return null;
    if (savedPlacement.styleTag && style && savedPlacement.styleTag !== style.styleTag) {
      return null;
    }
    if (style && (savedPlacement.budgetTotal ?? 0) !== style.budgetTotal) {
      return null;
    }
    if (
      style
      && roomFeatureSignature(savedPlacement.roomFeatures)
        !== roomFeatureSignature(style.roomFeatures)
    ) {
      return null;
    }
    return savedPlacement;
  }, [savedPlacement, style]);

  // Compose the slots from the fresh search, then overlay anything the user
  // saved. The two arrive independently, so this runs whenever either lands.
  useEffect(() => {
    // A saved layout carries full products, so it can render on its own even if
    // the furniture search failed or returned nothing.
    if (furniture.length === 0 && !activePlacement) return;

    const init: Record<string, FurnitureItem> = {};
    furniture.forEach((item) => { if (!init[item.category]) init[item.category] = item; });

    if (activePlacement) {
      const restored = readPlacement(activePlacement);
      // The saved product always wins over whatever the search returned this
      // time — search ids are positional, so "the same id" is a different sofa.
      Object.assign(init, restored.slots);

      // Removed pieces and placement only need seeding once; re-applying them
      // would undo edits the user made after the restore.
      if (!restoredRef.current) {
        restoredRef.current = true;
        setHiddenCategories(restored.hidden);
        placementRef.current = {
          positions: restored.positions,
          rotations: restored.rotations,
          scales: restored.scales,
        };
        setLivePlacement({
          positions: { ...restored.positions },
          rotations: { ...restored.rotations },
          scales: { ...restored.scales },
        });
        if (Object.keys(restored.colors).length) {
          setColorByCategory(restored.colors);
          Object.entries(restored.slots).forEach(([category, item]) => {
            if (restored.colors[category] && item?.id) {
              colorSourceIdsRef.current[category] = item.id;
            }
          });
        }
      }
    } else if (!restoredRef.current) {
      setHiddenCategories(new Set());
    }

    setFurnitureSlots(init);
  }, [furniture, activePlacement]);

  const initialPlacement = useMemo<Placement | null>(() => {
    if (!activePlacement) return null;
    const { positions, rotations, scales } = readPlacement(activePlacement);
    return { positions, rotations, scales };
  }, [activePlacement]);

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

  const commitRename = useCallback((currentName: string) => {
    setEditingName(false);
    const next = nameDraft.trim();
    if (!next || next === currentName) return;

    // Optimistic: reflect the new name immediately and keep it for other pages.
    setRenamedName(next);
    localStorage.setItem('blueprintCurrentRoomName', next);

    // The title is derived from the layout's own roomName on reload, so keep it
    // in sync — otherwise the rename would revert next time the page loads.
    const nextLayout = savedLayout ? { ...savedLayout, roomName: next } : null;
    if (nextLayout) {
      setSavedLayout(nextLayout);
      saveRoomLayout(nextLayout);
    }

    const roomId = localStorage.getItem('blueprintCurrentRoomId');
    if (!roomId) return;
    fetch(`/api/rooms/${roomId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(nextLayout ? { name: next, layout: nextLayout } : { name: next }),
    })
      .then((res) => { if (!res.ok) throw new Error(`rename failed (${res.status})`); })
      .catch((err) => console.error('[rename]', err));
  }, [nameDraft, savedLayout]);

  const handleSaveLayout = useCallback(async () => {
    setSaveStatus('saving');
    const placement = persistPlacement({ toServer: false, updateState: true });
    const roomId = localStorage.getItem('blueprintCurrentRoomId');

    if (!roomId || !placement) {
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
  }, [persistPlacement]);

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
      fetchFurniture(
        roomId ?? 'unknown',
        parsedStyle.styleTag,
        roomType,
        parsedStyle.roomFeatures,
        parsedStyle.budgetTotal,
      );
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

    fetchFurniture(
      roomId,
      parsedStyle.styleTag,
      roomType,
      parsedStyle.roomFeatures,
      parsedStyle.budgetTotal,
    );
  }, []);

  function fetchFurniture(
    roomId: string,
    styleTag: string,
    roomType = '',
    roomFeatures: string[] = [],
    budgetTotal = 0,
  ) {
    const params = new URLSearchParams({
      styleTag,
      roomType,
      budgetTotal: String(Math.max(0, budgetTotal)),
    });
    roomFeatures.forEach((feature) => params.append('roomFeature', feature));
    const url = `/api/rooms/${roomId}/furniture?${params.toString()}`;
    setFurnitureLoading(true);
    fetch(url)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
      .then((items: FurnitureItem[]) => { setFurniture(items); })
      .catch((err) => { console.error('[furniture]', err); setFurniture([]); })
      .finally(() => setFurnitureLoading(false));
  }

  // Hooks must stay above any conditional returns.
  const layoutRoomPreview = useMemo(
    () => buildRoomFromLayout(savedLayout, room ?? FALLBACK_ROOM),
    [savedLayout, room],
  );

  const layoutFurniturePreview = useMemo(() => {
    if (!style) return [] as FurnitureItem[];
    const slotted = orderedFurniture(furnitureSlots, style.roomType);
    const placeable = slotted.length > 0
      ? slotted
      : orderedFurniture(
          Object.fromEntries(furniture.map((item) => [item.category, item])),
          style.roomType,
        );
    return placeable.filter((item) => !hiddenCategories.has(item.category));
  }, [style, furnitureSlots, furniture, hiddenCategories]);

  // Only re-sample colors for pieces whose product id changed (swap / first load).
  // Moving furniture must not touch colors; swapping one piece must not recolor others.
  useEffect(() => {
    if (layoutFurniturePreview.length === 0) {
      setColorByCategory({});
      colorSourceIdsRef.current = {};
      return;
    }

    const palette = style?.colorPalette ?? [];
    const changed = layoutFurniturePreview.filter(
      (item) => colorSourceIdsRef.current[item.category] !== item.id,
    );

    // Keep existing colors (including for temporarily hidden pieces). Seed only changed ids.
    setColorByCategory((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const item of changed) {
        next[item.category] =
          colorFromName(item.name) ||
          paletteFallback(item.category, palette);
      }
      // Ensure every visible piece has a color even if it was wiped earlier.
      for (const item of layoutFurniturePreview) {
        if (!next[item.category]) {
          next[item.category] =
            colorFromName(item.name) ||
            paletteFallback(item.category, palette);
        }
      }
      return next;
    });

    if (changed.length === 0) return;

    const sampledFor = Object.fromEntries(changed.map((item) => [item.category, item.id]));
    let cancelled = false;
    resolveFurnitureColors(
      changed.map((item) => ({
        category: item.category,
        imageUrl: item.imageUrl,
        name: item.name,
        id: item.id,
      })),
      palette,
    ).then((colors) => {
      if (cancelled) return;
      setColorByCategory((prev) => {
        const next = { ...prev };
        for (const item of changed) {
          // Ignore stale results if the user swapped again before this finished.
          if (sampledFor[item.category] !== item.id) continue;
          const latest = layoutFurniturePreview.find((i) => i.category === item.category);
          if (!latest || latest.id !== item.id) continue;
          if (colors[item.category]) next[item.category] = colors[item.category];
          colorSourceIdsRef.current[item.category] = item.id;
        }
        return next;
      });
    });

    return () => { cancelled = true; };
  }, [layoutFurniturePreview, style?.colorPalette]);

  const isoRoom = useMemo<IsoRoomInput>(() => {
    const items: IsoFurnitureEntry[] = layoutFurniturePreview.map((item) => {
      const pos = livePlacement.positions[item.category];
      const color = colorByCategory[item.category];
      return {
        category: item.category,
        x: pos?.x ?? 0,
        y: pos?.y ?? 0,
        rotation: livePlacement.rotations[item.category] ?? 0,
        scale: livePlacement.scales[item.category] ?? 1,
        hidden: false,
        color,
        item: {
          widthIn: item.widthIn,
          depthIn: item.depthIn,
          name: item.name,
          color,
        },
      };
    });

    return {
      widthFt: layoutRoomPreview.widthFt,
      lengthFt: layoutRoomPreview.lengthFt,
      roomName: layoutRoomPreview.name,
      id: layoutRoomPreview.roomId || 'result-room',
      elements: (savedLayout?.elements ?? [])
        .filter((el) => el.type === 'door' || el.type === 'window')
        .map((el) => ({
          type: el.type as 'door' | 'window',
          x: el.x,
          y: el.y,
          angle: el.angle,
          ...(el.type === 'window' && el.width != null ? { width: el.width } : {}),
        })),
      roomPoints: savedLayout?.roomPoints,
      cutouts: (savedLayout?.cutouts ?? [])
        .filter((c) => Array.isArray(c.points) && c.points.length >= 3)
        .map((c) => ({
          id: c.id,
          points: c.points.map((p) => ({ x: p.x, y: p.y })),
        })),
      items,
    };
  }, [layoutFurniturePreview, livePlacement, layoutRoomPreview, savedLayout, colorByCategory]);

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
        <Link000 href="/inspo-upload.html" className="px-8 py-4 bg-[#D3968C] text-white rounded-2xl font-bold hover:bg-[#c1867b] transition-all">
          Analyze Style
        </Link000>
      </div>
    );
  }

  const s = style!;
  const layoutRoom = layoutRoomPreview;
  const roomName = renamedName ?? layoutRoom.name;
  const layoutFurniture = layoutFurniturePreview;

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
          <Link000 href="/dashboard.html" className="relative font-bold text-lg hover:opacity-70 transition-all">
            <iconify-icon icon="ph:house-duotone" /> Home
          </Link000>
          <Link000 href="/past-inspiration.html" className="relative font-bold text-lg hover:opacity-70 transition-all">
            <iconify-icon icon="ph:squares-four-duotone" /> Projects
          </Link000>
        </div>
        <div className="app-nav-actions">
          <button
            id="theme-toggle-btn"
            type="button"
            title="Toggle dark mode"
            aria-label="Toggle dark mode"
          >
            <iconify-icon icon="ph:moon-duotone" />
          </button>
          <ProfileMenu />
        </div>
      </nav>

      {/* Workflow stepper — lets the user step back to change the room or their
          preferences and re-analyze. Those pages restore prior input on load. */}
      <nav className="workflow-steps" aria-label="Room design progress">
        <Link000 className="workflow-step completed" href="/room-dimensions.html" aria-label="Back to Define Room">
          <iconify-icon class="workflow-arrow" icon="ph:arrow-left-bold" />
          <span><iconify-icon icon="ph:check-bold" /></span>
          <strong>Define Room</strong>
        </Link000>
        <div className="workflow-connector completed" />
        <Link000 className="workflow-step completed" href="/inspo-upload.html" aria-label="Back to Add Inspiration">
          <iconify-icon class="workflow-arrow" icon="ph:arrow-left-bold" />
          <span><iconify-icon icon="ph:check-bold" /></span>
          <strong>Add Inspiration</strong>
        </Link000>
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
              {editingName ? (
                <input
                  autoFocus
                  value={nameDraft}
                  maxLength={60}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => commitRename(roomName)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(roomName);
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                  className="text-5xl md:text-6xl font-bold text-[#F7F4D5] tracking-tight bg-transparent border-b-2 border-[#D3968C] outline-none w-full max-w-2xl"
                  aria-label="Room name"
                />
              ) : (
                <h1 className="group flex items-center gap-3 text-5xl md:text-6xl font-bold text-[#F7F4D5] tracking-tight">
                  {roomName}
                  <button
                    type="button"
                    onClick={() => { setNameDraft(roomName); setEditingName(true); }}
                    aria-label="Rename room"
                    title="Rename room"
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-2xl text-[#F7F4D5]"
                  >
                    <iconify-icon icon="ph:pencil-simple-duotone" />
                  </button>
                </h1>
              )}
              <p className="text-lg text-[#F7F4D5] font-medium">
                {layoutRoom.widthFt}' x {layoutRoom.lengthFt}' <span className="mx-2 opacity-30">|</span> {layoutRoom.sqft} sqft
              </p>
            </div>
            <div className="flex gap-3">
              <a
                href="/dashboard.html"
                className="px-6 py-3 bg-[#105666] hover:bg-[#156a7d] text-white rounded-2xl font-bold flex items-center gap-2 transition-all text-sm no-underline"
              >
                <iconify-icon icon="ph:house-duotone" />
                Return to Homepage
              </a>
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
              colorByCategory={colorByCategory}
            />
          }
          isoContent={
            <IsoRoomPreview room={isoRoom} label="3D preview · follows 2D" />
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
