import type { Auth, GoogleAuthProvider } from 'firebase/auth';
import type { FirebaseApp } from 'firebase/app';

export const firebaseConfig: Record<string, string | undefined>;
export function isFirebaseConfigured(): boolean;
export const app: FirebaseApp | null;
export const auth: Auth | null;
export const googleProvider: GoogleAuthProvider | null;
