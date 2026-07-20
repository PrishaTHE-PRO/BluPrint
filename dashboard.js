import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase.js";

var logoutBtn = document.getElementById('logout-btn');
var userNameEl = document.getElementById('user-name');
var ROOM_LAYOUT_STORAGE_KEY = 'blueprintRoomLayout';
var ROOM_LAYOUT_VERSION = 1;
var ROOM_LAYOUT_VIEWBOX = { width: 800, height: 500 };
var ROOM_LAYOUT_SCALE = 20;

var cachedUserName = localStorage.getItem('blueprintUserName');
if (userNameEl && cachedUserName) {
    userNameEl.textContent = cachedUserName + '!';
}

document.querySelectorAll('a[href="room-dimensions.html"]').forEach((link) => {
    link.addEventListener('click', clearCurrentProjectDraft);
});

if (!isFirebaseConfigured() || !auth) {
    window.location.href = 'index.html';
} else {
onAuthStateChanged(auth, function(user) {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    var name = user.displayName || user.email.split('@')[0];
    if (userNameEl) {
        userNameEl.textContent = name + '!';
    }
    localStorage.setItem('blueprintUserName', name);

    // Store uid so other pages can use it
    localStorage.setItem('blueprintUserId', user.uid);

    loadProjects(user.uid);
});
}

async function loadProjects(userId) {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;

    grid.innerHTML = '<p class="text-[#F7F4D5]/40 text-center col-span-2 py-12">Loading your projects...</p>';

    try {
        const res = await fetch('/api/rooms?userId=' + encodeURIComponent(userId));
        if (!res.ok) throw new Error();
        const rooms = await res.json();

        if (!rooms.length) {
            grid.innerHTML = '<p class="text-[#F7F4D5]/40 text-center col-span-2 py-12">No projects yet — click "Get Started" to create your first room!</p>';
            grid.setAttribute('aria-busy', 'false');
            return;
        }

        // Newest first, cap at 4 on dashboard
        rooms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const recent = rooms.slice(0, 4);

        grid.innerHTML = '';
        const cards = document.createDocumentFragment();
        recent.forEach((room, index) => {
            const hasStyle = !!room.style;
            const statusLabel = hasStyle ? 'Style Analyzed ✨' : 'Dimensions Set';
            const statusColor = hasStyle ? 'text-[#839958] font-bold' : 'text-[#F7F4D5]/40';
            const tag = room.style?.styleTag || '';
            const date = new Date(room.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const roomPreview = renderRoomPreview(room);
            const roomName = escapeHtml(room.name || 'Untitled Room');
            const roomSqft = escapeHtml(Math.round(Number(room.sqft) || 0));
            const styleTag = escapeHtml(tag);

            const card = document.createElement('div');
            card.className = 'garden-card ghibli-border p-6 group cursor-pointer project-card-enter';
            card.style.setProperty('--card-delay', `${index * 55}ms`);
            card.innerHTML = `
                <div class="relative aspect-[16/10] rounded-[2.5rem] overflow-hidden mb-8 shadow-inner bg-[#F7F4D5] flex items-center justify-center">
                    ${roomPreview}
                    <button class="delete-btn absolute top-5 left-5 w-9 h-9 rounded-full bg-[#0A3323]/70 hover:bg-[#D3968C] text-[#F7F4D5] flex items-center justify-center transition-all backdrop-blur z-10" title="Delete room">
                        <iconify-icon icon="ph:x-bold" class="text-lg"></iconify-icon>
                    </button>
                    <div class="absolute top-5 right-5">
                        <span class="bg-white/90 backdrop-blur px-4 py-2 rounded-full text-[#0A3323] text-sm font-bold shadow-lg">${hasStyle ? 'Complete' : 'In Progress'}</span>
                    </div>
                </div>
                <div class="px-2 space-y-2">
                    <div class="flex items-center gap-2">
                        <h3 class="room-name-display text-3xl font-bold text-[#F7F4D5]">${roomName}</h3>
                        <button class="rename-btn opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-[#F7F4D5] shrink-0" title="Rename room" aria-label="Rename room">
                            <iconify-icon icon="ph:pencil-simple-duotone" class="text-xl"></iconify-icon>
                        </button>
                    </div>
                    <p class="text-lg text-[#F7F4D5]/60">${roomSqft} sq ft${styleTag ? ' · ' + styleTag : ''}</p>
                    <div class="pt-6 flex items-center justify-between border-t border-[#F7F4D5]/10 mt-6">
                        <span class="text-sm ${statusColor}">${statusLabel}</span>
                        <span class="text-xs text-[#F7F4D5]/30">${date}</span>
                    </div>
                </div>`;
            cards.appendChild(card);

            // Rename → inline edit, doesn't navigate
            card.querySelector('.rename-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                startRename(card, room);
            });

            // Click card body → revisit project
            card.addEventListener('click', (e) => {
                // don't navigate while deleting or renaming
                if (e.target.closest('.delete-btn') || e.target.closest('.rename-btn') || e.target.tagName === 'INPUT') return;
                localStorage.setItem('blueprintCurrentRoomId',     room._id);
                localStorage.setItem('blueprintCurrentRoomName',   room.name);
                localStorage.setItem('blueprintCurrentRoomWidth',  String(room.widthFt));
                localStorage.setItem('blueprintCurrentRoomLength', String(room.lengthFt));
                localStorage.setItem('blueprintCurrentRoomHeight', String(room.heightFt || 8));
                localStorage.setItem(ROOM_LAYOUT_STORAGE_KEY, JSON.stringify(getRoomPreviewLayout(room)));
                if (room.style) {
                    localStorage.setItem('blueprintStyleResult', JSON.stringify({
                        roomType:     room.style.roomType     ?? '',
                        styleTag:     room.style.styleTag     ?? '',
                        moodTags:     room.style.moodTags     ?? [],
                        colorPalette: room.style.colorPalette ?? [],
                        roomFeatures: room.style.roomFeatures ?? [],
                        confidence:   room.style.confidence   ?? 0,
                    }));
                    window.location.href = 'room-result.html';
                } else {
                    window.location.href = 'inspo-upload.html';
                }
            });

            const deleteBtn = card.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (deleteBtn.dataset.confirming) {
                    deleteBtn.textContent = '...';
                    deleteBtn.disabled = true;
                    try {
                        const res = await fetch('/api/rooms/' + room._id, { method: 'DELETE' });
                        if (res.ok) {
                            card.style.transition = 'opacity 0.3s';
                            card.style.opacity = '0';
                            setTimeout(() => loadProjects(userId), 300);
                        } else {
                            alert('Delete failed (' + res.status + ')');
                            deleteBtn.disabled = false;
                            deleteBtn.innerHTML = '<iconify-icon icon="ph:x-bold" class="text-lg"></iconify-icon>';
                        }
                    } catch (err) {
                        alert('Delete failed: ' + err.message);
                        deleteBtn.disabled = false;
                        deleteBtn.innerHTML = '<iconify-icon icon="ph:x-bold" class="text-lg"></iconify-icon>';
                    }
                } else {
                    deleteBtn.dataset.confirming = '1';
                    deleteBtn.style.background = '#D3968C';
                    deleteBtn.title = 'Click again to confirm delete';
                    deleteBtn.innerHTML = '<iconify-icon icon="ph:trash-duotone" class="text-lg"></iconify-icon>';
                    setTimeout(() => {
                        if (deleteBtn.dataset.confirming) {
                            delete deleteBtn.dataset.confirming;
                            deleteBtn.style.background = '';
                            deleteBtn.title = 'Delete room';
                            deleteBtn.innerHTML = '<iconify-icon icon="ph:x-bold" class="text-lg"></iconify-icon>';
                        }
                    }, 3000);
                }
            });
        });
        grid.appendChild(cards);
        grid.setAttribute('aria-busy', 'false');
    } catch {
        grid.innerHTML = '<p class="text-[#D3968C]/60 text-center col-span-2 py-12">Could not load projects — is the server running?</p>';
        grid.setAttribute('aria-busy', 'false');
    }
}

// Inline-rename a room from its dashboard card. Swaps the title for an input,
// commits on Enter/blur, cancels on Escape. PATCHes the room's name.
function startRename(card, room) {
    const nameEl = card.querySelector('.room-name-display');
    if (!nameEl) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = room.name || '';
    input.maxLength = 60;
    input.className = 'room-name-display text-3xl font-bold text-[#F7F4D5] bg-transparent border-b-2 border-[#D3968C] outline-none w-full';
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const finish = async (commit) => {
        if (done) return;
        done = true;

        const next = input.value.trim();
        const h3 = document.createElement('h3');
        h3.className = 'room-name-display text-3xl font-bold text-[#F7F4D5]';

        if (commit && next && next !== room.name) {
            room.name = next;
            h3.textContent = next;
            input.replaceWith(h3);
            try {
                const res = await fetch('/api/rooms/' + room._id, {
                    method:  'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ name: next }),
                });
                if (!res.ok) throw new Error('rename failed (' + res.status + ')');
            } catch (err) {
                console.error('[rename]', err);
                alert('Rename failed — is the server running? Try again.');
            }
        } else {
            h3.textContent = room.name || 'Untitled Room';
            input.replaceWith(h3);
        }
    };

    input.addEventListener('click',   (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter')  finish(true);
        if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
}

function clearCurrentProjectDraft() {
    [
        'blueprintCurrentRoomId',
        'blueprintCurrentRoomName',
        'blueprintCurrentRoomWidth',
        'blueprintCurrentRoomLength',
        'blueprintCurrentRoomHeight',
        'blueprintStyleResult',
        ROOM_LAYOUT_STORAGE_KEY,
    ].forEach((key) => localStorage.removeItem(key));
}

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

function renderRoomPreview(room) {
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

if (logoutBtn) {
    logoutBtn.addEventListener('click', async function() {
        await signOut(auth);
        localStorage.removeItem('blueprintUserName');
        window.location.href = 'index.html';
    });
}
