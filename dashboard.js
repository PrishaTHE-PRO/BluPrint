import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase.js";

var logoutBtn = document.getElementById('logout-btn');
var userNameEl = document.getElementById('user-name');

onAuthStateChanged(auth, function(user) {
    if (!isFirebaseConfigured()) return;

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

        grid.innerHTML = '';
        withStyles.forEach(room => {
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
