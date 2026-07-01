import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase.js";

var logoutBtn = document.getElementById('logout-btn');
var userNameEl = document.getElementById('user-name');

if (!isFirebaseConfigured() || !auth) {
    window.location.href = 'index.html';
} else {
onAuthStateChanged(auth, function(user) {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    var name = user.displayName || user.email.split('@')[0];
    if (userNameEl) userNameEl.textContent = name + '!';

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
            return;
        }

        // Fetch style for each room in parallel
        const withStyles = await Promise.all(rooms.map(async room => {
            try {
                const sr = await fetch('/api/rooms/' + room._id + '/style');
                const styles = sr.ok ? await sr.json() : [];
                const userStyle = styles.find(s => s.source === 'user') || null;
                return { ...room, style: userStyle };
            } catch {
                return { ...room, style: null };
            }
        }));

        // Newest first, cap at 4 on dashboard
        withStyles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const recent = withStyles.slice(0, 4);

        grid.innerHTML = '';
        recent.forEach(room => {
            const hasStyle = !!room.style;
            const statusLabel = hasStyle ? 'Style Analyzed ✨' : 'Dimensions Set';
            const statusColor = hasStyle ? 'text-[#839958] font-bold' : 'text-[#F7F4D5]/40';
            const tag = room.style?.styleTag || '';
            const date = new Date(room.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            const card = document.createElement('div');
            card.className = 'garden-card ghibli-border p-6 group cursor-pointer';
            card.innerHTML = `
                <div class="relative aspect-[16/10] rounded-[2.5rem] overflow-hidden mb-8 shadow-inner bg-[#105666]/30 flex items-center justify-center">
                    <iconify-icon icon="ph:floor-plan-duotone" class="text-7xl text-[#D3968C]/40"></iconify-icon>
                    <button class="delete-btn absolute top-5 left-5 w-9 h-9 rounded-full bg-[#0A3323]/70 hover:bg-[#D3968C] text-[#F7F4D5] flex items-center justify-center transition-all backdrop-blur z-10" title="Delete room">
                        <iconify-icon icon="ph:x-bold" class="text-lg"></iconify-icon>
                    </button>
                    <div class="absolute top-5 right-5">
                        <span class="bg-white/90 backdrop-blur px-4 py-2 rounded-full text-[#0A3323] text-sm font-bold shadow-lg">${hasStyle ? 'Complete' : 'In Progress'}</span>
                    </div>
                </div>
                <div class="px-2 space-y-2">
                    <h3 class="text-3xl font-bold text-[#F7F4D5]">${room.name}</h3>
                    <p class="text-lg text-[#F7F4D5]/60">${room.sqft} sq ft${tag ? ' · ' + tag : ''}</p>
                    <div class="pt-6 flex items-center justify-between border-t border-[#F7F4D5]/10 mt-6">
                        <span class="text-sm ${statusColor}">${statusLabel}</span>
                        <span class="text-xs text-[#F7F4D5]/30">${date}</span>
                    </div>
                </div>`;
            grid.appendChild(card);

            // Click card body → revisit project
            card.addEventListener('click', (e) => {
                if (e.target.closest('.delete-btn')) return; // don't navigate on delete
                localStorage.setItem('blueprintCurrentRoomId',     room._id);
                localStorage.setItem('blueprintCurrentRoomName',   room.name);
                localStorage.setItem('blueprintCurrentRoomWidth',  String(room.widthFt));
                localStorage.setItem('blueprintCurrentRoomLength', String(room.lengthFt));
                if (room.style) {
                    localStorage.setItem('blueprintStyleResult', JSON.stringify({
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
                            setTimeout(() => card.remove(), 300);
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
    } catch {
        grid.innerHTML = '<p class="text-[#D3968C]/60 text-center col-span-2 py-12">Could not load projects — is the server running?</p>';
    }
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', async function() {
        await signOut(auth);
        window.location.href = 'index.html';
    });
}
