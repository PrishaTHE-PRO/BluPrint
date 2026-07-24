import { onAuthStateChanged, signOut, updateProfile } from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase.mjs";
import { renderRoomPreview, getRoomPreviewLayout, escapeHtml } from "./iso-preview.js";

var logoutBtn = document.getElementById('logout-btn');
var profileBtn = document.getElementById('profile-btn');
var profilePopup = document.getElementById('profile-popup');
function setProfilePopupIdentity(name, email) {
    var nameEl = document.querySelector('[data-profile-name]');
    var emailEl = document.querySelector('[data-profile-email]');
    if (nameEl) nameEl.textContent = name || 'Account';
    if (emailEl) emailEl.textContent = email || 'Manage your BluPrint profile';
}
if (profileBtn && profilePopup) {
    profileBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = profilePopup.classList.toggle('hidden') === false;
        profileBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
        if (!profilePopup.contains(e.target) && !profileBtn.contains(e.target)) {
            profilePopup.classList.add('hidden');
            profileBtn.setAttribute('aria-expanded', 'false');
        }
    });
}

var settingsBtn = document.getElementById('settings-btn');
var settingsOverlay = document.getElementById('settings-overlay');
var settingsCloseBtn = document.getElementById('settings-close-btn');
var settingsNameInput = document.getElementById('settings-name');
var settingsBirthdayInput = document.getElementById('settings-birthday');
var settingsSaveBtn = document.getElementById('settings-save-btn');
var settingsSaveStatus = document.getElementById('settings-save-status');

function openSettingsModal() {
    if (settingsNameInput) settingsNameInput.value = localStorage.getItem('blueprintUserName') || '';
    if (settingsBirthdayInput) settingsBirthdayInput.value = localStorage.getItem('blueprintUserBirthday') || '';
    if (settingsOverlay) settingsOverlay.classList.remove('hidden');
    if (profilePopup) profilePopup.classList.add('hidden');
}
function closeSettingsModal() {
    if (settingsOverlay) settingsOverlay.classList.add('hidden');
    if (settingsSaveStatus) settingsSaveStatus.textContent = '';
}
if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
if (settingsCloseBtn) settingsCloseBtn.addEventListener('click', closeSettingsModal);
if (settingsOverlay) settingsOverlay.addEventListener('click', function (e) {
    if (e.target === settingsOverlay) closeSettingsModal();
});

if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener('click', async function () {
        var newName = settingsNameInput.value.trim();
        var newBirthday = settingsBirthdayInput.value;
        try {
            if (newName) {
                localStorage.setItem('blueprintUserName', newName);
                if (auth.currentUser) {
                    await updateProfile(auth.currentUser, { displayName: newName });
                }
                if (userNameEl) userNameEl.textContent = newName + '!';
                setProfilePopupIdentity(newName, auth.currentUser && auth.currentUser.email);
            }
            if (newBirthday) localStorage.setItem('blueprintUserBirthday', newBirthday);
            settingsSaveStatus.textContent = 'Saved!';
            setTimeout(function () { settingsSaveStatus.textContent = ''; }, 2000);
        } catch (err) {
            settingsSaveStatus.textContent = 'Error: ' + err.message;
        }
    });
}
var userNameEl = document.getElementById('user-name');
var isLoggingOut = false;
var ROOM_LAYOUT_STORAGE_KEY = 'blueprintRoomLayout';
var ROOM_LAYOUT_VERSION = 1;
var ROOM_LAYOUT_VIEWBOX = { width: 800, height: 500 };
var ROOM_LAYOUT_SCALE = 20;
var FURNITURE_PLACEMENT_STORAGE_KEY = 'blueprintFurniturePlacement';

/** Seed localStorage and route into the right step for a saved project. */
async function openSavedProject(room) {
    localStorage.setItem('blueprintCurrentRoomId', room._id);
    localStorage.setItem('blueprintCurrentRoomName', room.name);
    localStorage.setItem('blueprintCurrentRoomWidth', String(room.widthFt));
    localStorage.setItem('blueprintCurrentRoomLength', String(room.lengthFt));
    localStorage.setItem('blueprintCurrentRoomHeight', String(room.heightFt || 8));
    if (room.budgetTotal > 0) {
        localStorage.setItem('blueprintBudgetTotal', String(room.budgetTotal));
    } else {
        localStorage.removeItem('blueprintBudgetTotal');
    }
    localStorage.setItem(ROOM_LAYOUT_STORAGE_KEY, JSON.stringify(getRoomPreviewLayout(room)));

    if (room.furnitureLayout) {
        try {
            localStorage.setItem(FURNITURE_PLACEMENT_STORAGE_KEY, JSON.stringify(room.furnitureLayout));
        } catch (_) { /* ignore quota */ }
    }

    let style = room.style;
    if (!style && (room.furnitureLayout || room.layout)) {
        try {
            const docs = await fetch('/api/rooms/' + room._id + '/style').then((r) => (r.ok ? r.json() : []));
            style = (Array.isArray(docs) && (docs.find((s) => s.source === 'user') || docs[0])) || null;
        } catch (_) { /* ignore */ }
    }

    if (style) {
        localStorage.setItem('blueprintCurrentRoomType', style.roomType ?? '');
        localStorage.setItem('blueprintStyleResult', JSON.stringify({
            roomType:     style.roomType     ?? '',
            styleTag:     style.styleTag     ?? '',
            moodTags:     style.moodTags     ?? [],
            colorPalette: style.colorPalette ?? [],
            roomFeatures: style.roomFeatures ?? [],
            confidence:   style.confidence   ?? 0,
            budgetTotal:  Number(room.budgetTotal) || 0,
        }));
    }

    const hasDesign = !!(style || room.furnitureLayout);
    window.location.href = hasDesign ? 'room-result.html' : 'inspo-upload.html';
}

var cachedUserName = localStorage.getItem('blueprintUserName');
if (userNameEl && cachedUserName) {
    userNameEl.textContent = cachedUserName + '!';
}
setProfilePopupIdentity(cachedUserName || 'Account', '');

document.querySelectorAll('a[href="room-dimensions.html"]').forEach((link) => {
    link.addEventListener('click', clearCurrentProjectDraft);
});

if (!isFirebaseConfigured() || !auth) {
    window.location.href = 'login.html';
} else {
onAuthStateChanged(auth, function(user) {
    if (!user) {
        window.location.href = isLoggingOut ? 'index.html' : 'login.html';
        return;
    }

    var name = user.displayName || user.email.split('@')[0];
    if (userNameEl) {
        userNameEl.textContent = name + '!';
    }
    localStorage.setItem('blueprintUserName', name);

    // Store uid so other pages can use it
    localStorage.setItem('blueprintUserId', user.uid);
    setProfilePopupIdentity(name, user.email || '');

    loadProjects(user.uid);
});
}

async function loadProjects(userId) {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;

    grid.innerHTML = '<p class="text-[#F7F4D5]/40 text-center col-span-2 py-12">Loading your projects...</p>';

    try {
        // no-store so a freshly-saved layout is always reflected (never a cached GET).
        const res = await fetch('/api/rooms?userId=' + encodeURIComponent(userId), { cache: 'no-store' });
        if (!res.ok) throw new Error();
        const rooms = await res.json();

        if (!rooms.length) {
            grid.innerHTML = '<p class="text-[#F7F4D5]/40 text-center col-span-2 py-12">No projects yet — click "Get Started" to create your first room!</p>';
            grid.setAttribute('aria-busy', 'false');
            return;
        }

        // Newest first, cap at 4 on dashboard
        rooms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const recent = rooms.slice(0, 6);

        grid.innerHTML = '';
        const cards = document.createDocumentFragment();
        recent.forEach((room, index) => {
            const hasDesign = !!(room.style || room.furnitureLayout);
            const statusLabel = hasDesign ? 'Style Analyzed ✨' : 'Dimensions Set';
            const statusColor = hasDesign ? 'text-[#839958] font-bold' : 'text-[#F7F4D5]/40';
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
                        <span class="bg-white/90 backdrop-blur px-4 py-2 rounded-full text-[#0A3323] text-sm font-bold shadow-lg">${hasDesign ? 'Complete' : 'In Progress'}</span>
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
                openSavedProject(room);
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
    input.className = 'room-name-display room-name-input text-3xl font-bold text-[#F7F4D5] bg-transparent border-b-2 border-[#D3968C] outline-none w-full';
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
        'blueprintBudgetTotal',
        'blueprintStyleResult',
        ROOM_LAYOUT_STORAGE_KEY,
    ].forEach((key) => localStorage.removeItem(key));
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', async function() {
        isLoggingOut = true;
        await signOut(auth);
        localStorage.removeItem('blueprintUserName');
        window.location.href = 'index.html';
    });
}

// When returning to the dashboard from the back/forward cache (e.g. pressing
// Back after saving a layout), the page is restored without re-running its
// startup code — so re-fetch the projects to reflect the latest saved layout.
window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    var uid = localStorage.getItem('blueprintUserId');
    if (uid) loadProjects(uid);
});
