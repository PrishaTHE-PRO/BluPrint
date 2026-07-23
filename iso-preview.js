const ROOM_LAYOUT_VERSION = 1;
const ROOM_LAYOUT_VIEWBOX = { width: 800, height: 500 };
const ROOM_LAYOUT_SCALE = 20;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char]));
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function svgNumber(value, fallback = 0) {
    return Number(toNumber(value, fallback).toFixed(3));
}

function normalizePoint(point) {
    return {
        x: svgNumber(point?.x),
        y: svgNumber(point?.y),
    };
}

function createCenteredRoomPoints(widthFt, lengthFt, viewBox = ROOM_LAYOUT_VIEWBOX, scale = ROOM_LAYOUT_SCALE) {
    const safeWidthFt = Math.max(toNumber(widthFt, 12), 1);
    const safeLengthFt = Math.max(toNumber(lengthFt, 14), 1);
    const maxWidthScale = (viewBox.width - 160) / safeWidthFt;
    const maxLengthScale = (viewBox.height - 120) / safeLengthFt;
    const derivedScale = Math.min(scale, maxWidthScale, maxLengthScale);
    const safeScale = Number.isFinite(derivedScale) && derivedScale > 0 ? derivedScale : scale;
    const roomWidth = safeWidthFt * safeScale;
    const roomLength = safeLengthFt * safeScale;
    const centerX = viewBox.width / 2;
    const centerY = viewBox.height / 2;

    return [
        { x: centerX - roomWidth / 2, y: centerY - roomLength / 2 },
        { x: centerX + roomWidth / 2, y: centerY - roomLength / 2 },
        { x: centerX + roomWidth / 2, y: centerY + roomLength / 2 },
        { x: centerX - roomWidth / 2, y: centerY + roomLength / 2 },
    ].map(normalizePoint);
}

function hasUsableLayout(layout) {
    return !!layout
        && typeof layout === 'object'
        && Array.isArray(layout.roomPoints)
        && layout.roomPoints.length >= 3;
}

function getRoomPreviewLayout(room) {
    if (hasUsableLayout(room.layout)) {
        return normalizeLayout(room.layout, room);
    }

    const widthFt = toNumber(room.widthFt, 12);
    const lengthFt = toNumber(room.lengthFt, 14);
    const heightFt = toNumber(room.heightFt, 8);

    return {
        version: ROOM_LAYOUT_VERSION,
        roomId: room._id,
        roomName: room.name || 'My Room',
        widthFt,
        lengthFt,
        heightFt,
        sqft: toNumber(room.sqft, widthFt * lengthFt),
        scale: ROOM_LAYOUT_SCALE,
        viewBox: { ...ROOM_LAYOUT_VIEWBOX },
        roomPoints: createCenteredRoomPoints(widthFt, lengthFt),
        elements: [],
        cutouts: [],
        savedAt: room.updatedAt || room.createdAt || new Date().toISOString(),
    };
}

function normalizeLayout(layout, room) {
    const viewBox = {
        width: Math.max(toNumber(layout.viewBox?.width, ROOM_LAYOUT_VIEWBOX.width), 1),
        height: Math.max(toNumber(layout.viewBox?.height, ROOM_LAYOUT_VIEWBOX.height), 1),
    };
    const widthFt = toNumber(layout.widthFt, room.widthFt);
    const lengthFt = toNumber(layout.lengthFt, room.lengthFt);

    return {
        version: typeof layout.version === 'number' ? layout.version : ROOM_LAYOUT_VERSION,
        roomId: typeof layout.roomId === 'string' ? layout.roomId : room._id,
        roomName: typeof layout.roomName === 'string' && layout.roomName.trim() ? layout.roomName : room.name || 'My Room',
        widthFt,
        lengthFt,
        heightFt: toNumber(layout.heightFt, room.heightFt || 8),
        sqft: toNumber(layout.sqft, room.sqft || widthFt * lengthFt),
        scale: Math.max(toNumber(layout.scale, ROOM_LAYOUT_SCALE), 1),
        viewBox,
        roomPoints: layout.roomPoints.map(normalizePoint),
        elements: Array.isArray(layout.elements) ? layout.elements.map((element) => ({
            id: element?.id ?? '',
            type: element?.type === 'window' ? 'window' : 'door',
            x: svgNumber(element?.x),
            y: svgNumber(element?.y),
            angle: svgNumber(element?.angle),
            ...(element?.type === 'window' && element?.width != null ? { width: svgNumber(element.width) } : {}),
        })) : [],
        cutouts: Array.isArray(layout.cutouts) ? layout.cutouts.map((cutout) => ({
            id: cutout?.id ?? '',
            type: 'cutout',
            points: Array.isArray(cutout?.points) ? cutout.points.map(normalizePoint) : [],
        })) : [],
        savedAt: typeof layout.savedAt === 'string' ? layout.savedAt : room.updatedAt || room.createdAt || new Date().toISOString(),
    };
}

function buildClosedPath(points) {
    if (!Array.isArray(points) || points.length < 3) return '';
    return `${points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${svgNumber(point.x)} ${svgNumber(point.y)}`).join(' ')} Z`;
}

function renderArchitectureElement(element) {
    const x = svgNumber(element.x);
    const y = svgNumber(element.y);
    const angle = svgNumber(element.angle);

    if (element.type === 'window') {
        return `
            <g transform="translate(${x},${y}) rotate(${angle}) translate(-25, 0)">
                <rect x="0" y="-4" width="50" height="8" fill="#0A3323" stroke="#F7F4D5" stroke-width="1.5"></rect>
                <line x1="5" y1="-1.5" x2="45" y2="-1.5" stroke="#F7F4D5" stroke-width="1"></line>
                <line x1="5" y1="1.5" x2="45" y2="1.5" stroke="#F7F4D5" stroke-width="1"></line>
            </g>`;
    }

    return `
        <g transform="translate(${x},${y}) rotate(${angle}) translate(-20, 0)">
            <path d="M 0 0 L 40 0" stroke="#F7F4D5" stroke-width="3"></path>
            <path d="M 40 0 A 40 40 0 0 1 0 40" stroke="#F7F4D5" stroke-width="1.5" stroke-dasharray="4 4" fill="none"></path>
            <path d="M 0 0 L 0 40" stroke="#D3968C" stroke-width="4"></path>
        </g>`;
}

// ─── Isometric "ink pen" room preview (Phase 2: walls + furniture) ──────────
// Renders the saved room as a hand-drawn 2.5-D sketch (blue ink, light cream +
// blues) using Rough.js, loaded via CDN in dashboard.html (window.rough). Draws
// the room shell plus each placed furniture piece from room.furnitureLayout,
// depth-sorted (painter's algorithm). Non-rectangular layouts currently render
// as their bounding box; true polygon walls are future work. Falls back to the
// flat top-down preview if Rough.js is unavailable.
const ISO = { angle: Math.PI / 6, unit: 26, wallHeightFt: 4.2, pad: 30 };
const ISO_COLORS = {
    floor:    '#faf3e1',
    wallTop:  '#f5eed9',
    wallSide: '#e9e0c8',
    patch:    '#fbf7ee',
    cutout:   '#e4d5bf',
    grid:     'rgba(47,80,125,.14)',
    ink:      '#233b63',
};

// Display heights in feet — we store furniture footprint but not height, so we
// approximate one per category (a rug is flat, a wardrobe is tall).
const FURN_HEIGHTS = {
    rug: 0.04, bedroom_rug: 0.04, dining_rug: 0.04, kitchen_rug: 0.04, nursery_rug: 0.04, bath_mat: 0.04,
    sofa: 2.4, accent_chair: 2.7, rocking_chair: 2.7, office_chair: 3, dining_chair: 3, bar_stool: 2.5,
    coffee_table: 1.4, side_table: 2,
    floor_lamp: 4.8, bedside_lamp: 1.6, desk_lamp: 1.4,
    bed: 2, crib: 3, nightstand: 2, desk: 2.5, dining_table: 2.5, island_cart: 3,
    dresser: 2.8, nursery_dresser: 2.8, sideboard: 2.8, vanity: 2.8, kitchen_storage: 3, bar_cabinet: 3.5,
    wardrobe: 6, bookshelf: 5, storage_cabinet: 4, kitchen_shelf: 4, bath_storage: 3, nursery_shelf: 4,
    bath_mirror: 2.2, bath_light: 0.8, nursery_lamp: 1.4, monitor_stand: 1.2,
    bathtub: 1.7, standing_shower: 6.2, shower_curtain: 5.8,
    reading_nook: 2.8, workspace_desk: 2.5, vanity_station: 2.8, bookcase: 5, indoor_plants: 3, smart_lighting: 4.6,
};
// Furniture colours — warm wood / textile neutrals as last-resort defaults.
// Live product colors are passed via entry.color when available.
const FURN_COLORS = {
    rug: '#C9B8A0', bedroom_rug: '#C9B8A0', dining_rug: '#C9B8A0', kitchen_rug: '#C9B8A0', nursery_rug: '#C9B8A0', bath_mat: '#C9B8A0',
    sofa: '#8B7355', accent_chair: '#A67C52', rocking_chair: '#A67C52', office_chair: '#6B5B4F', dining_chair: '#A67C52', bar_stool: '#A67C52',
    bed: '#D4C4A8', crib: '#D4C4A8',
    coffee_table: '#C4A574', side_table: '#B8956C', nightstand: '#B8956C', desk: '#C4A574', dining_table: '#C4A574', monitor_stand: '#C4A574', island_cart: '#C4A574',
    dresser: '#A08060', sideboard: '#A08060', vanity: '#A08060', kitchen_storage: '#A08060', bar_cabinet: '#8B7355',
    wardrobe: '#8B7355', bookshelf: '#8B7355', storage_cabinet: '#8B7355', kitchen_shelf: '#8B7355', bath_storage: '#8B7355', nursery_shelf: '#8B7355',
    floor_lamp: '#E8D9A8', bedside_lamp: '#E8D9A8', desk_lamp: '#E8D9A8',
    wall_art: '#8B7355', floating_shelves: '#B8956C',
    reading_nook: '#A67C52', workspace_desk: '#C4A574', vanity_station: '#A08060', bookcase: '#8B7355', smart_lighting: '#E8D9A8', full_length_mirror: '#A67C52',
    indoor_plants: '#5d8a62',
};
// Default footprint (inches) when a saved item omits its own dimensions — keyed
// per category so a bed falls back to a bed's size, not a generic small box.
// Mirrors RoomSVG's defaults so the preview matches the design page.
const FURN_DEFAULT_W = {
    sofa: 84, accent_chair: 32, coffee_table: 48, rug: 96, floor_lamp: 12, side_table: 18,
    bed: 60, nightstand: 20, dresser: 48, bedroom_rug: 96, wardrobe: 36, bedside_lamp: 10,
    bar_stool: 16, pendant_light: 12, kitchen_rug: 24, kitchen_storage: 30, island_cart: 48, kitchen_shelf: 36,
    vanity: 36, bath_mirror: 24, bath_storage: 20, bath_mat: 20, bath_light: 24, shower_curtain: 60,
    bathtub: 60, standing_shower: 36,
    desk: 60, office_chair: 24, bookshelf: 36, desk_lamp: 10, storage_cabinet: 24, monitor_stand: 24,
    dining_table: 60, dining_chair: 18, dining_rug: 96, sideboard: 54, dining_light: 18, bar_cabinet: 36,
    crib: 52, nursery_dresser: 36, rocking_chair: 28, nursery_rug: 72, nursery_shelf: 30, nursery_lamp: 10,
    wall_art: 42, floating_shelves: 44,
    reading_nook: 34, workspace_desk: 60, vanity_station: 40, bookcase: 36, indoor_plants: 22, smart_lighting: 12, full_length_mirror: 26,
};
const FURN_DEFAULT_D = {
    sofa: 36, accent_chair: 32, coffee_table: 24, rug: 72, floor_lamp: 12, side_table: 18,
    bed: 80, nightstand: 16, dresser: 18, bedroom_rug: 72, wardrobe: 24, bedside_lamp: 10,
    bar_stool: 16, pendant_light: 12, kitchen_rug: 60, kitchen_storage: 14, island_cart: 24, kitchen_shelf: 12,
    vanity: 21, bath_mirror: 4, bath_storage: 12, bath_mat: 30, bath_light: 8, shower_curtain: 3,
    bathtub: 30, standing_shower: 36,
    desk: 30, office_chair: 24, bookshelf: 14, desk_lamp: 10, storage_cabinet: 18, monitor_stand: 12,
    dining_table: 36, dining_chair: 18, dining_rug: 72, sideboard: 18, dining_light: 18, bar_cabinet: 18,
    crib: 28, nursery_dresser: 18, rocking_chair: 30, nursery_rug: 60, nursery_shelf: 12, nursery_lamp: 10,
    wall_art: 3, floating_shelves: 10,
    reading_nook: 34, workspace_desk: 30, vanity_station: 18, bookcase: 14, indoor_plants: 22, smart_lighting: 12, full_length_mirror: 4,
};
const furnHeight  = (cat) => FURN_HEIGHTS[cat] ?? 2.5;
const furnColor   = (cat) => FURN_COLORS[cat] || '#A08060';
const furnWidthIn = (cat) => FURN_DEFAULT_W[cat] || 36;
const furnDepthIn = (cat) => FURN_DEFAULT_D[cat] || 30;

const STACKABLE_CATEGORIES = new Set([
    'bedside_lamp', 'desk_lamp', 'nursery_lamp', 'bath_mirror', 'bath_light', 'monitor_stand', 'indoor_plants',
]);
const SURFACE_CATEGORIES = new Set([
    'nightstand', 'desk', 'workspace_desk', 'vanity', 'vanity_station', 'dresser', 'nursery_dresser',
    'sideboard', 'side_table', 'coffee_table', 'dining_table', 'island_cart', 'bookshelf', 'bookcase',
    'kitchen_shelf', 'nursery_shelf', 'kitchen_storage', 'bath_storage', 'storage_cabinet', 'bar_cabinet',
    'monitor_stand',
]);
const isStackable = (cat) => STACKABLE_CATEGORIES.has(cat);
const isSurface = (cat) => SURFACE_CATEGORIES.has(cat);
const canStackTogether = (a, b) => (isStackable(a) && isSurface(b)) || (isSurface(a) && isStackable(b));

function isoFootprint(x, y, w, d, rot = 0) {
    const radians = (rot * Math.PI) / 180;
    const occupiedWidth = Math.abs(w * Math.cos(radians)) + Math.abs(d * Math.sin(radians));
    const occupiedDepth = Math.abs(w * Math.sin(radians)) + Math.abs(d * Math.cos(radians));
    const cx = x + w / 2;
    const cy = y + d / 2;
    return {
        minX: cx - occupiedWidth / 2,
        maxX: cx + occupiedWidth / 2,
        minY: cy - occupiedDepth / 2,
        maxY: cy + occupiedDepth / 2,
    };
}

function isoFootprintsOverlap(a, b, clearance = 0.05) {
    return a.maxX > b.minX + clearance
        && a.minX < b.maxX - clearance
        && a.maxY > b.minY + clearance
        && a.minY < b.maxY - clearance;
}

function stackElevationFt(entry, items) {
    if (!entry || entry.hidden || !isStackable(entry.category)) return 0;
    const scale = Math.max(0.5, Math.min(2, toNumber(entry.scale, 1) || 1));
    const w = toNumber(entry.item && entry.item.widthIn, furnWidthIn(entry.category)) / 12 * scale;
    const d = toNumber(entry.item && entry.item.depthIn, furnDepthIn(entry.category)) / 12 * scale;
    if (w <= 0 || d <= 0) return 0;
    const self = isoFootprint(toNumber(entry.x), toNumber(entry.y), w, d, toNumber(entry.rotation));
    let elev = 0;
    (Array.isArray(items) ? items : []).forEach((other) => {
        if (!other || other.hidden || !isSurface(other.category)) return;
        if (other === entry || other.category === entry.category) return;
        if (!canStackTogether(entry.category, other.category)) return;
        const oScale = Math.max(0.5, Math.min(2, toNumber(other.scale, 1) || 1));
        const ow = toNumber(other.item && other.item.widthIn, furnWidthIn(other.category)) / 12 * oScale;
        const od = toNumber(other.item && other.item.depthIn, furnDepthIn(other.category)) / 12 * oScale;
        if (ow <= 0 || od <= 0) return;
        const otherBounds = isoFootprint(toNumber(other.x), toNumber(other.y), ow, od, toNumber(other.rotation));
        if (isoFootprintsOverlap(self, otherBounds)) elev = Math.max(elev, furnHeight(other.category));
    });
    return elev;
}

function isoProject(x, y, z) {
    return {
        px: (x - y) * Math.cos(ISO.angle) * ISO.unit,
        py: (x + y) * Math.sin(ISO.angle) * ISO.unit - z * ISO.unit,
    };
}

// Darken/lighten a colour by amt (-1..1) — used for the shaded box faces.
// Accepts BOTH "#rrggbb" and "rgb(r,g,b)" so a colour that was already shaded
// once (e.g. a headboard or chair leg) can be shaded again for its faces without
// collapsing to black (the previous hex-only parse turned rgb() input into
// rgb(0,0,0)).
function isoShade(color, amt) {
    let r, g, b;
    if (color[0] === '#') {
        const n = parseInt(color.slice(1), 16);
        r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
    } else {
        const m = color.match(/\d+/g) || [0, 0, 0];
        r = +m[0]; g = +m[1]; b = +m[2];
    }
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// Matches the approved "Ink pen (hand-drawn)" style: crisp solid fills with a
// lightly wobbling hand-drawn line.
function isoPenOptions(fill, fillStyle = 'solid') {
    return { fill, fillStyle, stroke: ISO_COLORS.ink, strokeWidth: 1.6, roughness: 1.7, bowing: 1.2, seed: 1 };
}

function isoCutoutFeet(cutout, minX, minY, editorScale = 20) {
    const points = Array.isArray(cutout?.points) ? cutout.points : [];
    return points
        .map((p) => ({
            x: (toNumber(p?.x) - minX) / editorScale,
            y: (toNumber(p?.y) - minY) / editorScale,
        }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

function isoCutoutGroup(cutout, minX, minY, WH) {
    const pts = isoCutoutFeet(cutout, minX, minY);
    if (pts.length < 3) return null;

    const P = (x, y, z) => { const q = isoProject(x, y, z); return [q.px, q.py]; };
    const ops = [];

    const wallH = Math.min(WH * 0.55, 2.4);
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        ops.push({
            kind: 'poly',
            pts: [P(a.x, a.y, 0), P(b.x, b.y, 0), P(b.x, b.y, wallH), P(a.x, a.y, wallH)],
            fill: ISO_COLORS.wallSide,
        });
        ops.push({ kind: 'line', a: P(a.x, a.y, wallH), b: P(b.x, b.y, wallH) });
    }

    const o0 = pts[0], o1 = pts[1];
    const steps = 6;
    for (let s = 0; s < steps; s += 2) {
        const t0 = s / steps, t1 = Math.min(1, (s + 1) / steps);
        ops.push({
            kind: 'line',
            a: P(o0.x + (o1.x - o0.x) * t0, o0.y + (o1.y - o0.y) * t0, 0.02),
            b: P(o0.x + (o1.x - o0.x) * t1, o0.y + (o1.y - o0.y) * t1, 0.02),
        });
    }

    const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
    const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
    return { order: -1e6 + 3 + cx + cy * 0.01, ops };
}

function isoFloorWithHoles(W, L, cutoutPolysFt) {
    const ring = (pts) => {
        if (!pts.length) return '';
        const first = isoProject(pts[0].x, pts[0].y, 0);
        let d = `M ${first.px.toFixed(2)} ${first.py.toFixed(2)}`;
        for (let i = 1; i < pts.length; i++) {
            const p = isoProject(pts[i].x, pts[i].y, 0);
            d += ` L ${p.px.toFixed(2)} ${p.py.toFixed(2)}`;
        }
        return `${d} Z`;
    };
    const outer = ring([
        { x: 0, y: 0 },
        { x: W, y: 0 },
        { x: W, y: L },
        { x: 0, y: L },
    ]);
    const holes = (cutoutPolysFt || [])
        .filter((pts) => pts && pts.length >= 3)
        .map((pts) => ring([...pts].reverse()))
        .join(' ');
    return {
        kind: 'floorPath',
        d: `${outer} ${holes}`.trim(),
        fill: ISO_COLORS.floor,
    };
}

// Which silhouette a furniture category is modeled as.
function isoArchetype(cat) {
    if (cat === 'bed' || cat === 'crib') return 'bed';
    if (cat === 'sofa') return 'sofa';
    if (['accent_chair', 'dining_chair', 'office_chair', 'bar_stool', 'rocking_chair', 'reading_nook'].includes(cat)) return 'chair';
    if (['coffee_table', 'dining_table', 'side_table', 'desk', 'monitor_stand', 'island_cart', 'workspace_desk'].includes(cat)) return 'table';
    if (['floor_lamp', 'desk_lamp', 'bedside_lamp', 'smart_lighting'].includes(cat)) return 'lamp';
    if (['bookcase', 'bookshelf', 'kitchen_shelf', 'nursery_shelf'].includes(cat)) return 'openshelf';
    if (cat === 'bathtub') return 'bathtub';
    if (cat === 'standing_shower') return 'standing_shower';
    if (cat === 'shower_curtain') return 'shower_curtain';
    return 'box';
}

// Cabinet-type pieces get sketched front-face detail (drawers / shelves / doors).
function isoSeamFor(cat) {
    if (cat === 'nightstand') return { type: 'drawer', rows: 2 };
    if (['dresser', 'nursery_dresser', 'sideboard', 'vanity', 'kitchen_storage', 'vanity_station'].includes(cat)) return { type: 'drawer', rows: 3 };
    if (['bookshelf', 'kitchen_shelf', 'nursery_shelf', 'bath_storage'].includes(cat)) return { type: 'shelf', rows: 4 };
    if (['wardrobe', 'storage_cabinet', 'bar_cabinet'].includes(cat)) return { type: 'door' };
    return null;
}

// A furniture piece → ordered sub-boxes (back→front, bottom→top), each
// { lx, ly, lw, ld, z0, h, color, seam? } in the piece's local footprint (feet).
// Composing a few boxes is what turns a plain cube into a recognizable shape.
function isoModelParts(cat, w, d, hex, H) {
    switch (isoArchetype(cat)) {
        case 'bed': return [
            { lx: 0,        ly: 0,        lw: w,        ld: d * 0.10, z0: 0,   h: Math.max(2.2, H), color: isoShade(hex, -0.06) }, // headboard
            { lx: 0,        ly: d * 0.10, lw: w,        ld: d * 0.90, z0: 0,   h: 1.0,  color: isoShade(hex, 0.05) },              // mattress
            { lx: w * 0.10, ly: d * 0.16, lw: w * 0.34, ld: d * 0.15, z0: 1.0, h: 0.32, color: '#f3ecda' },                        // pillow L
            { lx: w * 0.56, ly: d * 0.16, lw: w * 0.34, ld: d * 0.15, z0: 1.0, h: 0.32, color: '#f3ecda' },                        // pillow R
        ];
        case 'chair': {
            const legT = Math.max(0.15, Math.min(w, d) * 0.13), inset = 0.06;
            const seatTop = 1.2, padH = 0.22;                          // low, chair-like seat
            const backThick = Math.max(0.18, d * 0.13);
            const backTop = Math.max(seatTop + padH + 1.05, H);        // tall back above the seat
            const legC = isoShade(hex, -0.22);
            // Bottom-up: legs, cushion, then the backrest resting ON TOP of the
            // cushion (not overlapping it). Because no two parts share a vertical
            // band, there's no depth conflict — the chair renders correctly at
            // ANY rotation (the old overlapping backrest broke when rotated ~180°).
            return [
                { lx: inset,            ly: inset,            lw: legT, ld: legT, z0: 0, h: seatTop, color: legC },
                { lx: w - inset - legT, ly: inset,            lw: legT, ld: legT, z0: 0, h: seatTop, color: legC },
                { lx: inset,            ly: d - inset - legT, lw: legT, ld: legT, z0: 0, h: seatTop, color: legC },
                { lx: w - inset - legT, ly: d - inset - legT, lw: legT, ld: legT, z0: 0, h: seatTop, color: legC },
                { lx: 0, ly: 0, lw: w, ld: d,         z0: seatTop,        h: padH, color: hex },                          // cushion
                { lx: 0, ly: 0, lw: w, ld: backThick, z0: seatTop + padH, h: backTop - (seatTop + padH), color: hex },    // backrest on top
            ];
        }
        case 'sofa': return [
            { lx: 0,        ly: 0,        lw: w,        ld: d * 0.28, z0: 0, h: H,        color: isoShade(hex, -0.06) }, // back
            { lx: 0,        ly: d * 0.28, lw: w * 0.12, ld: d * 0.72, z0: 0, h: H * 0.78, color: isoShade(hex, -0.03) }, // arm L
            { lx: w * 0.88, ly: d * 0.28, lw: w * 0.12, ld: d * 0.72, z0: 0, h: H * 0.78, color: isoShade(hex, -0.03) }, // arm R
            { lx: w * 0.12, ly: d * 0.28, lw: w * 0.76, ld: d * 0.72, z0: 0, h: H * 0.46, color: hex },                  // seat
        ];
        case 'table': {
            const legT = Math.max(0.13, Math.min(w, d) * 0.09), topH = 0.16, inset = 0.06, legC = isoShade(hex, -0.22);
            return [
                { lx: inset,             ly: inset,             lw: legT, ld: legT, z0: 0, h: H - topH, color: legC },
                { lx: w - inset - legT,  ly: inset,             lw: legT, ld: legT, z0: 0, h: H - topH, color: legC },
                { lx: inset,             ly: d - inset - legT,  lw: legT, ld: legT, z0: 0, h: H - topH, color: legC },
                { lx: w - inset - legT,  ly: d - inset - legT,  lw: legT, ld: legT, z0: 0, h: H - topH, color: legC },
                { lx: 0, ly: 0, lw: w, ld: d, z0: H - topH, h: topH, color: hex }, // top
            ];
        }
        case 'lamp': {
            // A standing floor lamp for EVERY lamp type: small base, tall slim
            // pole, cream shade — fixed tall height regardless of the category.
            const cx = w / 2, cy = d / 2, SH = 4.2,
                  baseW = Math.min(w, d) * 0.6, poleT = 0.14, shadeW = Math.max(Math.min(w, d) * 0.9, 0.85);
            return [
                { lx: cx - baseW / 2,  ly: cy - baseW / 2,  lw: baseW,  ld: baseW,  z0: 0,        h: 0.12,      color: isoShade(hex, -0.18) }, // base
                { lx: cx - poleT / 2,  ly: cy - poleT / 2,  lw: poleT,  ld: poleT,  z0: 0.12,     h: SH - 0.9,  color: isoShade(hex, -0.10) }, // pole
                { lx: cx - shadeW / 2, ly: cy - shadeW / 2, lw: shadeW, ld: shadeW, z0: SH - 0.8, h: 0.7,       color: '#f4eccf' },            // shade
            ];
        }
        case 'openshelf': {
            // Open étagère: thin plank shelves held by two thin side panels, NO
            // back — like the floating shelves, just connected at the ends.
            const st = Math.max(0.1, w * 0.045), bd = Math.max(0.12, d * 0.12);
            const comps = Math.max(2, Math.round(H / 1.7));
            const parts = [];
            for (let i = 0; i <= comps; i++) { const z = (H - bd) * (i / comps); parts.push({ lx: 0, ly: 0, lw: w, ld: d, z0: z, h: bd, color: hex }); }
            parts.push({ lx: 0,      ly: 0, lw: st, ld: d, z0: 0, h: H, color: isoShade(hex, -0.04) });
            parts.push({ lx: w - st, ly: 0, lw: st, ld: d, z0: 0, h: H, color: isoShade(hex, -0.04) });
            return parts;
        }
        case 'bathtub': {
            const rim = Math.max(0.12, Math.min(w, d) * 0.08);
            return [
                { lx: 0, ly: 0, lw: w, ld: d, z0: 0, h: H * 0.55, color: isoShade(hex, -0.06) },
                { lx: rim, ly: rim, lw: w - rim * 2, ld: d - rim * 2, z0: H * 0.35, h: H * 0.2, color: isoShade(hex, 0.12) },
            ];
        }
        case 'standing_shower': {
            const glass = isoShade('#cfe0ee', 0.05);
            const frame = isoShade(hex, -0.15);
            const t = Math.max(0.08, Math.min(w, d) * 0.05);
            return [
                { lx: 0, ly: 0, lw: w, ld: d, z0: 0, h: 0.12, color: frame },
                { lx: 0, ly: 0, lw: t, ld: d, z0: 0.12, h: H - 0.12, color: glass },
                { lx: w - t, ly: 0, lw: t, ld: d, z0: 0.12, h: H - 0.12, color: glass },
                { lx: 0, ly: 0, lw: w, ld: t, z0: 0.12, h: H - 0.12, color: glass },
            ];
        }
        case 'shower_curtain': {
            const panels = Math.max(4, Math.round(w / 0.55));
            const pw = w / panels;
            const parts = [];
            for (let i = 0; i < panels; i++) {
                const inset = (i % 2 === 0 ? 0 : 0.04);
                parts.push({
                    lx: i * pw + 0.02,
                    ly: inset,
                    lw: Math.max(0.08, pw - 0.06),
                    ld: Math.max(0.08, d - inset),
                    z0: 0.15,
                    h: H - 0.15,
                    color: i % 2 === 0 ? hex : isoShade(hex, -0.08),
                });
            }
            parts.push({ lx: 0, ly: 0, lw: w, ld: Math.max(0.06, d * 0.4), z0: H - 0.08, h: 0.08, color: isoShade(hex, -0.2) });
            return parts;
        }
        default: // plain box (cabinets/shelves) with optional drawer/shelf/door detail
            return [{ lx: 0, ly: 0, lw: w, ld: d, z0: 0, h: H, color: hex, seam: isoSeamFor(cat) }];
    }
}

// Draw-ops for one extruded sub-box: 3 faces + optional front-face seams
// (drawer/shelf lines, door split, knobs), rotated `rot`° around the piece
// centre (cxR,cyR). Ops carry a `kind` so the painter can dispatch.
function isoPartOps(ox, oy, cxR, cyR, rot, lx, ly, lw, ld, z0, h, color, seam) {
    const rad = rot * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    const corners = [[lx, ly], [lx + lw, ly], [lx + lw, ly + ld], [lx, ly + ld]].map(([ux, uy]) => {
        const wx = ox + ux, wy = oy + uy, dx = wx - cxR, dy = wy - cyR;
        return { x: cxR + dx * c - dy * s, y: cyR + dx * s + dy * c };
    });
    const pt = (p) => [p.px, p.py];
    const bot = corners.map((p) => isoProject(p.x, p.y, z0));
    const top = corners.map((p) => isoProject(p.x, p.y, z0 + h));
    const ops = [];

    // Draw only the two camera-facing side faces: keeps a rotated piece solid
    // (no see-through) with no hidden back-face outlines. Visibility is judged
    // against THIS part's own centre (not the whole piece's) — otherwise the
    // front face of a part that sits at the back of its piece (a chair/sofa
    // back, a bed's headboard) is wrongly culled and the back goes invisible.
    const pcx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
    const pcy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
    for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        const ex = corners[j].x - corners[i].x, ey = corners[j].y - corners[i].y;
        const mx = (corners[i].x + corners[j].x) / 2, my = (corners[i].y + corners[j].y) / 2;
        let nx = ey, ny = -ex;                                                 // a normal to the edge…
        if (nx * (mx - pcx) + ny * (my - pcy) < 0) { nx = -nx; ny = -ny; }     // …made to point outward
        const base = isoProject(mx, my, z0), tip = isoProject(mx + nx, my + ny, z0);
        if (tip.py - base.py <= 0) continue;                                   // faces away from camera → hidden
        const fill = (tip.px - base.px) >= 0 ? isoShade(color, -0.13) : isoShade(color, -0.26);
        ops.push({ kind: 'poly', pts: [bot[i], bot[j], top[j], top[i]].map(pt), fill });
    }
    ops.push({ kind: 'poly', pts: top.map(pt), fill: color }); // roof

    if (seam) {
        const cL = corners[3], cR = corners[2]; // the piece's own front edge (local +y side)
        const P = (cc, z) => { const q = isoProject(cc.x, cc.y, z); return [q.px, q.py]; };
        const mid = { x: (cL.x + cR.x) / 2, y: (cL.y + cR.y) / 2 };
        if (seam.type === 'drawer' || seam.type === 'shelf') {
            for (let i = 1; i < seam.rows; i++) { const z = z0 + h * (i / seam.rows); ops.push({ kind: 'line', a: P(cL, z), b: P(cR, z) }); }
            if (seam.type === 'drawer') {
                for (let i = 0; i < seam.rows; i++) { const z = z0 + h * ((i + 0.5) / seam.rows); ops.push({ kind: 'knob', c: P(mid, z) }); }
            }
        } else if (seam.type === 'door') {
            ops.push({ kind: 'line', a: P(mid, z0), b: P(mid, z0 + h) });
            ops.push({ kind: 'knob', c: P({ x: mid.x - (cR.x - cL.x) * 0.07, y: mid.y - (cR.y - cL.y) * 0.07 }, z0 + h * 0.5) });
            ops.push({ kind: 'knob', c: P({ x: mid.x + (cR.x - cL.x) * 0.07, y: mid.y + (cR.y - cL.y) * 0.07 }, z0 + h * 0.5) });
        }
    }
    return ops;
}

// Wall-mounted pieces render flat on / attached to a wall, not as floor boxes.
function isoIsWallMounted(cat) { return cat === 'wall_art' || cat === 'floating_shelves' || cat === 'full_length_mirror'; }

// Returns { order, ops } for a wall-mounted item on the back wall only.
// Left-wall attachments are omitted in 3D (still shown on 2D).
function isoWallMounted(cat, cx, cy, w, d, hex, WH) {
    const onBack = cy <= cx;
    if (!onBack) return null;
    const along = cx;
    const P = (x, y, z) => { const q = isoProject(x, y, z); return [q.px, q.py]; };
    const ops = [];

    if (cat === 'wall_art') {
        const aw = Math.max(1.2, w), ah = Math.min(1.9, WH - 0.6), zc = WH * 0.55, off = 0.05, ins = 0.16;
        const z1 = zc - ah / 2, z2 = zc + ah / 2;
        const rect = (o, i) =>
            [P(cx - aw / 2 + i, o, z1 + i), P(cx + aw / 2 - i, o, z1 + i), P(cx + aw / 2 - i, o, z2 - i), P(cx - aw / 2 + i, o, z2 - i)];
        ops.push({ kind: 'poly', pts: rect(off, 0), fill: isoShade(hex, -0.05) });
        ops.push({ kind: 'poly', pts: rect(off + 0.01, ins), fill: '#efe6cc' });
        return { order: -500 + along, ops };
    }

    if (cat === 'full_length_mirror') {
        const mw = Math.max(1.0, w), z1 = 0.1, z2 = WH - 0.1, off = 0.06, ins = 0.1;
        const rect = (o, i) =>
            [P(cx - mw / 2 + i, o, z1 + i), P(cx + mw / 2 - i, o, z1 + i), P(cx + mw / 2 - i, o, z2 - i), P(cx - mw / 2 + i, o, z2 - i)];
        ops.push({ kind: 'poly', pts: rect(off, 0), fill: isoShade('#6f8fb2', -0.05) });
        ops.push({ kind: 'poly', pts: rect(off + 0.01, ins), fill: '#cfe0ee' });
        return { order: -495 + along, ops };
    }

    const sw = Math.max(1.6, w), sd = Math.max(0.55, Math.min(1.0, d || 0.8));
    [WH * 0.5, WH * 0.8].forEach((z0) => {
        const ox = cx - sw / 2, oy = 0, lw = sw, ld = sd;
        isoPartOps(0, 0, 0, 0, 0, ox, oy, lw, ld, z0, 0.14, hex, null).forEach((op) => ops.push(op));
    });
    return { order: -490 + along, ops };
}

// A sketchy leaf: a pointed oval from base (bx,by) along `ang` for `len`, `wid` wide.
function isoLeafPath(bx, by, ang, len, wid) {
    const dx = Math.sin(ang), dy = -Math.cos(ang), px = -dy, py = dx;
    const tx = bx + dx * len, ty = by + dy * len, mx = bx + dx * len * 0.5, my = by + dy * len * 0.5, f = (n) => n.toFixed(1);
    return `M ${f(bx)} ${f(by)} Q ${f(mx + px * wid)} ${f(my + py * wid)} ${f(tx)} ${f(ty)} Q ${f(mx - px * wid)} ${f(my - py * wid)} ${f(bx)} ${f(by)} Z`;
}

// Indoor plant — a real 3-D isometric pot (extruded, shaded like everything
// else) with sketchy leaf paths emerging from around its rim in 3-D: back leaves
// dark, front leaves lighter. Short dark-green leaves, drawn in front of the pot.
function isoPlantOps(cx, cy, w, d, baseZ = 0) {
    const sc = Math.max(0.85, Math.min(w, d)) * ISO.unit;
    const potWf = Math.max(0.5, Math.min(w, d) * 0.55), rimW = potWf * 1.14, potHf = 0.72, rim = potWf * 0.4, top = baseZ + potHf;
    const dark = '#3e6a45', mid = '#4c7a51', lite = '#5d8a62', pot = '#cbb896';
    const ops = [];
    // 3-D pot first, so the leaves sit in front of it
    isoPartOps(0, 0, 0, 0, 0, cx - potWf / 2, cy - potWf / 2, potWf, potWf, baseZ, potHf - 0.12, pot, null).forEach((op) => ops.push(op));
    isoPartOps(0, 0, 0, 0, 0, cx - rimW / 2, cy - rimW / 2, rimW, rimW, baseZ + potHf - 0.12, 0.12, isoShade(pot, 0.05), null).forEach((op) => ops.push(op));
    const L = (ox, oy, ang, len, wid, col, i) => { const o = isoProject(ox, oy, top); ops.push({ kind: 'path', d: isoLeafPath(o.px, o.py, ang, len * sc, wid * sc), fill: col, seed: i }); };
    // leaves emerge from around the rim, back (dark) → front (light)
    L(cx, cy - rim, -0.12, 1.3, 0.34, dark, 1);
    L(cx - rim * 0.7, cy - rim * 0.6, -0.7, 1.0, 0.3, dark, 2);
    L(cx + rim * 0.7, cy - rim * 0.6,  0.7, 1.0, 0.3, dark, 3);
    L(cx - rim, cy, -1.05, 0.9, 0.3, mid, 4);
    L(cx + rim, cy,  1.05, 0.9, 0.3, mid, 5);
    L(cx, cy, 0.0, 1.35, 0.36, mid, 6);
    L(cx - rim * 0.5, cy + rim * 0.6, -0.35, 1.0, 0.32, lite, 7);
    L(cx + rim * 0.5, cy + rim * 0.6,  0.35, 1.0, 0.32, lite, 8);
    L(cx, cy + rim, -0.08, 1.15, 0.34, lite, 9);
    return ops;
}

// Door/window from the room layout (positions in editor px, 20px/ft). Rendered
// flat on a wall, but ONLY on the two visible walls (back y=0, left x=0);
// elements on the front walls are skipped since those walls aren't drawn.
function isoArchElement(el, W, L, WH, minX, minY, spanX, spanY) {
    const P = (x, y, z) => { const q = isoProject(x, y, z); return [q.px, q.py]; };
    const fx = spanX > 0 ? (el.x - minX) / spanX : 0.5;
    const fy = spanY > 0 ? (el.y - minY) / spanY : 0.5;
    const m = Math.min(fy, 1 - fy, fx, 1 - fx);
    let onBack, along;
    if (m === fy) { onBack = true; along = fx * W; }          // back wall (y=0)
    else if (m === fx) { return null; }                      // left wall — keep clear in 3D
    else return null;                                        // front wall → skip
    const rectAt = (hw, z1, z2, off, ins) => onBack
        ? [P(along - hw + ins, off, z1 + ins), P(along + hw - ins, off, z1 + ins), P(along + hw - ins, off, z2 - ins), P(along - hw + ins, off, z2 - ins)]
        : [P(off, along - hw + ins, z1 + ins), P(off, along + hw - ins, z1 + ins), P(off, along + hw - ins, z2 - ins), P(off, along - hw + ins, z2 - ins)];
    const ops = [];
    if (el.type === 'window') {
        // Windows carry a saved width in editor px (20px/ft); size to it, else 3 ft.
        const hw = Math.max(0.6, (el.width ? el.width / 20 : 3) / 2), z1 = WH * 0.32, z2 = WH * 0.78, off = 0.03, midZ = (z1 + z2) / 2;
        ops.push({ kind: 'poly', pts: rectAt(hw, z1, z2, off, 0), fill: '#cfe0ee' });   // glass
        const vt = onBack ? [P(along, off + 0.01, z1), P(along, off + 0.01, z2)] : [P(off + 0.01, along, z1), P(off + 0.01, along, z2)];
        const hz = onBack ? [P(along - hw, off + 0.01, midZ), P(along + hw, off + 0.01, midZ)] : [P(off + 0.01, along - hw, midZ), P(off + 0.01, along + hw, midZ)];
        ops.push({ kind: 'line', a: vt[0], b: vt[1] });                                 // mullion cross
        ops.push({ kind: 'line', a: hz[0], b: hz[1] });
        return { order: -470 + along, ops };
    }
    // door — light-blue leaf panel + inner panel + knob
    const hw = 1.35, z1 = 0.02, z2 = WH * 0.92, off = 0.03, knobZ = (z1 + z2) / 2, ka = along + hw * 0.7;
    ops.push({ kind: 'poly', pts: rectAt(hw, z1, z2, off, 0), fill: '#a7bdd6' });
    ops.push({ kind: 'poly', pts: rectAt(hw, z1, z2, off + 0.005, 0.12), fill: '#c2d3e4' });
    ops.push({ kind: 'knob', c: onBack ? P(ka, off + 0.02, knobZ) : P(off + 0.02, ka, knobZ) });
    return { order: -480 + along, ops };
}

function renderIsoRoom(room) {
    const rough = window.rough;
    if (!rough) return null;

    const layout = getRoomPreviewLayout(room);
    const W = Math.max(toNumber(layout.widthFt, room.widthFt), 1);
    const L = Math.max(toNumber(layout.lengthFt, room.lengthFt), 1);
    const WH = ISO.wallHeightFt;

    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('class', 'w-full h-full select-none');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', (layout.roomName || 'Room') + ' isometric preview');

    const rc = rough.svg(svg);
    const pt = (p) => [p.px, p.py];

    // Rough.js styling for the seam details. Knobs use a light fill (never black).
    const LINE_OPTS = { stroke: ISO_COLORS.ink, strokeWidth: 1.1, roughness: 1.3, bowing: 0.7, seed: 1 };
    const KNOB_OPTS = { fill: '#e9eef5', fillStyle: 'solid', stroke: ISO_COLORS.ink, strokeWidth: 0.6, roughness: 0.8, seed: 1 };
    const paint = (op) => {
        if (op.kind === 'poly') svg.appendChild(rc.polygon(op.pts, isoPenOptions(op.fill, op.fillStyle || 'solid')));
        else if (op.kind === 'line') svg.appendChild(rc.line(op.a[0], op.a[1], op.b[0], op.b[1], LINE_OPTS));
        else if (op.kind === 'knob') svg.appendChild(rc.circle(op.c[0], op.c[1], 3.4, KNOB_OPTS));
        else if (op.kind === 'disc') svg.appendChild(rc.circle(op.c[0], op.c[1], op.d, { fill: op.fill, fillStyle: 'solid', stroke: ISO_COLORS.ink, strokeWidth: 1.1, roughness: 1.8, bowing: 1.2, seed: 1 }));
        else if (op.kind === 'path') svg.appendChild(rc.path(op.d, { fill: op.fill, fillStyle: 'solid', stroke: ISO_COLORS.ink, strokeWidth: 1.1, roughness: 1.3, bowing: 1.1, seed: op.seed || 1 }));
        else if (op.kind === 'floorPath') {
            // Native SVG path — rough.js solid fills ignore compound holes.
            const path = document.createElementNS(svgNs, 'path');
            path.setAttribute('d', op.d);
            path.setAttribute('fill', op.fill);
            path.setAttribute('fill-rule', 'evenodd');
            path.setAttribute('stroke', ISO_COLORS.ink);
            path.setAttribute('stroke-width', '1.6');
            path.setAttribute('stroke-linejoin', 'round');
            svg.appendChild(path);
        }
    };

    // Painted back-to-front: shell first, then rugs, then furniture pieces by
    // depth. Within a piece, sub-boxes stay in their MODELED order (listed
    // back→front, bottom→top) — this stacks stacked parts (pillows on a bed,
    // seat on chair legs) correctly, which a single depth sort cannot.
    const shell = [
        { order: -1e6,     ops: [{ kind: 'poly', pts: [isoProject(0, 0, 0), isoProject(0, L, 0), isoProject(0, L, WH), isoProject(0, 0, WH)].map(pt), fill: ISO_COLORS.wallSide }] },
        { order: -1e6 + 1, ops: [{ kind: 'poly', pts: [isoProject(0, 0, 0), isoProject(W, 0, 0), isoProject(W, 0, WH), isoProject(0, 0, WH)].map(pt), fill: ISO_COLORS.wallTop }] },
        { order: -1e6 + 2, ops: [{ kind: 'poly', pts: [isoProject(0, 0, 0), isoProject(W, 0, 0), isoProject(W, L, 0), isoProject(0, L, 0)].map(pt), fill: ISO_COLORS.floor }] },
    ];

    // Furniture from the saved placement (feet from the room's top-left origin).
    const rugs = [], pieces = [];
    const items = Array.isArray(room.furnitureLayout && room.furnitureLayout.items)
        ? room.furnitureLayout.items
        : [];
    items.forEach((entry) => {
        if (!entry || entry.hidden || !entry.category) return;
        const cat = entry.category;
        const scale = Math.max(0.5, Math.min(2, toNumber(entry.scale, 1) || 1));
        const w = toNumber(entry.item && entry.item.widthIn, furnWidthIn(cat)) / 12 * scale;
        const d = toNumber(entry.item && entry.item.depthIn, furnDepthIn(cat)) / 12 * scale;
        if (w <= 0 || d <= 0) return;
        const x = toNumber(entry.x), y = toNumber(entry.y), rot = toNumber(entry.rotation);
        const H = furnHeight(cat);
        const hex = entry.color || (entry.item && entry.item.color) || furnColor(cat);
        const elev = stackElevationFt(entry, items);

        if (isoIsWallMounted(cat)) {
            const mounted = isoWallMounted(cat, x + w / 2, y + d / 2, w, d, hex, WH);
            if (mounted) pieces.push(mounted);
            return;
        }
        if (cat === 'indoor_plants') {
            pieces.push({
                order: (x + w / 2) + (y + d / 2) + elev * 0.01,
                ops: isoPlantOps(x + w / 2, y + d / 2, w, d, elev),
            });
            return;
        }

        if (H < 0.1) {
            // Rug — a flat pad just above the floor.
            const rad = rot * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad), cx = x + w / 2, cy = y + d / 2;
            const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
                .map(([lx, ly]) => isoProject(cx + lx * c - ly * s, cy + lx * s + ly * c, 0.02));
            rugs.push({ order: x + y - 900, ops: [{ kind: 'poly', pts: corners.map(pt), fill: hex }] });
            return;
        }
        const cxR = x + w / 2, cyR = y + d / 2;
        let parts = isoModelParts(cat, w, d, hex, H);
        // Open shelf & sofa: order parts by depth so far parts draw behind and
        // near parts in front (which is which depends on rotation).
        const arch = isoArchetype(cat);
        if (arch === 'openshelf' || arch === 'sofa') {
            const rad = rot * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
            parts = parts.map((p) => {
                const dx = (x + p.lx + p.lw / 2) - cxR, dy = (y + p.ly + p.ld / 2) - cyR;
                return { p, k: (cxR + dx * c - dy * s) + (cyR + dx * s + dy * c) };
            }).sort((a, b) => a.k - b.k).map((o) => o.p);
        } else if (arch === 'bed') {
            // Keep the mattress→pillows stack, but move the headboard (parts[0])
            // to the front of the paint order when the bed is rotated so its head
            // faces the camera (otherwise the mattress paints over it).
            const rad = rot * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
            const hb = parts[0], dx = (x + hb.lx + hb.lw / 2) - cxR, dy = (y + hb.ly + hb.ld / 2) - cyR;
            if ((cxR + dx * c - dy * s) + (cyR + dx * s + dy * c) > cxR + cyR) parts = [...parts.slice(1), hb];
        }
        let ops = [];
        parts.forEach((p) => {
            ops = ops.concat(isoPartOps(x, y, cxR, cyR, rot, p.lx, p.ly, p.lw, p.ld, p.z0 + elev, p.h, p.color, p.seam));
        });
        pieces.push({ order: cxR + cyR + elev * 0.01, ops });
    });

    // Doors, windows, and cutouts from the room layout.
    const elements = Array.isArray(layout.elements) ? layout.elements : [];
    const cutouts = Array.isArray(layout.cutouts) ? layout.cutouts : [];
    if ((elements.length || cutouts.length) && Array.isArray(layout.roomPoints) && layout.roomPoints.length >= 2) {
        const xs = layout.roomPoints.map((p) => p.x), ys = layout.roomPoints.map((p) => p.y);
        const eMinX = Math.min(...xs), eMinY = Math.min(...ys);
        const eSpanX = Math.max(...xs) - eMinX, eSpanY = Math.max(...ys) - eMinY;
        const cutoutFeetList = [];
        cutouts.forEach((cutout) => {
            const feet = isoCutoutFeet(cutout, eMinX, eMinY);
            if (feet.length >= 3) cutoutFeetList.push(feet);
            const g = isoCutoutGroup(cutout, eMinX, eMinY, WH);
            if (g) shell.push(g);
        });
        if (cutoutFeetList.length) {
            shell[2] = { order: -1e6 + 2, ops: [isoFloorWithHoles(W, L, cutoutFeetList)] };
        }
        elements.forEach((el) => {
            const g = isoArchElement(el, W, L, WH, eMinX, eMinY, eSpanX, eSpanY);
            if (g) pieces.push(g);
        });
    }

    // Fit the viewBox to the projected room bounding box (walls define the extent).
    const bounds = [
        isoProject(0, 0, 0), isoProject(W, 0, 0), isoProject(W, L, 0), isoProject(0, L, 0),
        isoProject(W, 0, WH), isoProject(0, 0, WH), isoProject(0, L, WH),
    ];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    bounds.forEach((p) => {
        minX = Math.min(minX, p.px); maxX = Math.max(maxX, p.px);
        minY = Math.min(minY, p.py); maxY = Math.max(maxY, p.py);
    });
    const pad = ISO.pad;
    const vbX = minX - pad, vbY = minY - pad;
    const vbW = maxX - minX + pad * 2, vbH = maxY - minY + pad * 2;
    svg.setAttribute('viewBox', `${vbX.toFixed(0)} ${vbY.toFixed(0)} ${vbW.toFixed(0)} ${vbH.toFixed(0)}`);

    // Paper-grid patch background — a faint blueprint grid on a rounded cream
    // panel behind the room, on the card's white. Unique pattern id per card.
    const center = isoProject(W / 2, L / 2, 0);
    const gid = 'iso-grid-' + String(room._id || room.name || 'room').replace(/[^a-zA-Z0-9_-]/g, '');
    const defs = document.createElementNS(svgNs, 'defs');
    defs.innerHTML =
        `<pattern id="${gid}" width="16" height="16" patternUnits="userSpaceOnUse">` +
        `<path d="M16 0 L0 0 0 16" fill="none" stroke="${ISO_COLORS.grid}" stroke-width="1"></path></pattern>`;
    svg.appendChild(defs);
    const px = center.px - vbW * 0.42, py = center.py - vbH * 0.42, pw = vbW * 0.84, ph = vbH * 0.84;
    const panel = document.createElementNS(svgNs, 'rect');
    panel.setAttribute('x', px.toFixed(1)); panel.setAttribute('y', py.toFixed(1));
    panel.setAttribute('width', pw.toFixed(1)); panel.setAttribute('height', ph.toFixed(1));
    panel.setAttribute('rx', '18'); panel.setAttribute('fill', ISO_COLORS.patch);
    const gridRect = panel.cloneNode();
    gridRect.setAttribute('fill', `url(#${gid})`);
    svg.appendChild(panel);
    svg.appendChild(gridRect);

    // Paint back-to-front: shell, then rugs, then furniture by piece depth.
    shell.sort((a, b) => a.order - b.order);
    rugs.sort((a, b) => a.order - b.order);
    pieces.sort((a, b) => a.order - b.order);
    [...shell, ...rugs, ...pieces].forEach((group) => group.ops.forEach(paint));

    return svg.outerHTML;
}

function renderRoomPreview(room) {
    try {
        const iso = renderIsoRoom(room);
        if (iso) return iso;
    } catch (err) {
        console.error('[iso preview] falling back to flat preview:', err);
    }
    return renderRoomPreviewFlat(room);
}

function renderRoomPreviewFlat(room) {
    const layout = getRoomPreviewLayout(room);
    const viewBox = layout.viewBox || ROOM_LAYOUT_VIEWBOX;
    const roomPath = buildClosedPath(layout.roomPoints);
    const cutoutPaths = layout.cutouts
        .map((cutout) => buildClosedPath(cutout.points))
        .filter(Boolean);
    const roomWithCutouts = [roomPath, ...cutoutPaths].join(' ');
    const gridId = `project-preview-grid-${String(room._id || room.name || 'room').replace(/[^a-zA-Z0-9_-]/g, '')}`;

    return `
        <svg
            viewBox="0 0 ${svgNumber(viewBox.width, ROOM_LAYOUT_VIEWBOX.width)} ${svgNumber(viewBox.height, ROOM_LAYOUT_VIEWBOX.height)}"
            preserveAspectRatio="xMidYMid meet"
            class="w-full h-full p-3 select-none"
            role="img"
            aria-label="${escapeHtml(layout.roomName)} room layout preview"
        >
            <defs>
                <pattern id="${gridId}" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(10,51,35,0.08)" stroke-width="1"></path>
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#${gridId})"></rect>
            <path
                d="${roomWithCutouts}"
                fill-rule="evenodd"
                fill="rgba(211, 150, 140, 0.07)"
                stroke="#D3968C"
                stroke-width="4"
                stroke-linejoin="round"
            ></path>
            ${layout.cutouts.map((cutout) => {
                const path = buildClosedPath(cutout.points);
                return path ? `<path d="${path}" fill="rgba(211,150,140,0.16)" stroke="#D3968C" stroke-width="1.5" stroke-dasharray="4 4"></path>` : '';
            }).join('')}
            ${layout.elements.map(renderArchitectureElement).join('')}
        </svg>`;
}


export function renderProjectRoomPreview(room) {
  return renderRoomPreview(room);
}

export { renderIsoRoom, renderRoomPreview, renderRoomPreviewFlat, getRoomPreviewLayout, escapeHtml };
