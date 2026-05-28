import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

export const firebaseConfig = {
    apiKey: "AIzaSyB8ERTansDx8hHn43uxVdG_uS-Mt9-pNGI",
    authDomain: "bluprint-e321b.firebaseapp.com",
    projectId: "bluprint-e321b",
    storageBucket: "bluprint-e321b.firebasestorage.app",
    messagingSenderId: "142963881273",
    appId: "1:142963881273:web:ca31b2abd3038511bfa4e8",
    measurementId: "G-0LF278XKG3"
};

export function isFirebaseConfigured() {
    return !Object.values(firebaseConfig).some(function(value) {
        return value.startsWith("PASTE_");
    });
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
