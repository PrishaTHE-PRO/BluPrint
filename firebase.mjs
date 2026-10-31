import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";

export const firebaseConfig = {
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const REQUIRED_KEYS = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
];

export function isFirebaseConfigured() {
    return REQUIRED_KEYS.every((key) => Boolean(firebaseConfig[key]));
}

let app = null;
let auth = null;
let googleProvider = null;

if (isFirebaseConfigured()) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
}

export { app, auth, googleProvider };

/**
 * fetch() that carries the signed-in user's Firebase ID token.
 *
 * The API verifies this token server-side and derives ownership from it, so
 * every /api/rooms call has to go through here — a bare fetch() now comes back
 * 401. Tokens are short-lived; getIdToken() refreshes them as needed, so this
 * is called per-request rather than cached.
 */
let authInitialised = null;

/**
 * Resolves once Firebase has finished restoring any persisted session.
 * Without this, a call made during page load sees currentUser === null and
 * sends no token, which reads as "signed out" even though the user is not.
 */
function whenAuthInitialised() {
    if (!auth) return Promise.resolve();
    if (!authInitialised) {
        authInitialised = new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, () => { unsubscribe(); resolve(); });
        });
    }
    return authInitialised;
}

export async function authedFetch(url, options = {}) {
    await whenAuthInitialised();

    const headers = new Headers(options.headers || {});
    const user = auth && auth.currentUser;
    if (user) headers.set("Authorization", `Bearer ${await user.getIdToken()}`);

    return fetch(url, { ...options, headers });
}

/** The signed-in user's UID, or null. Never trust this for authorisation —
 *  the server derives identity from the token, not from anything sent here. */
export async function currentUid() {
    await whenAuthInitialised();
    return (auth && auth.currentUser && auth.currentUser.uid) || null;
}
