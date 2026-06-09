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
});

if (logoutBtn) {
    logoutBtn.addEventListener('click', async function() {
        await signOut(auth);
        window.location.href = 'index.html';
    });
}
