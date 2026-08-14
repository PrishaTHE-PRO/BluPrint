import type { Auth, GoogleAuthProvider } from 'firebase/auth';
import type { FirebaseApp } from 'firebase/app';

export const firebaseConfig: Record<string, string | undefined>;
export function isFirebaseConfigured(): boolean;
export const app: FirebaseApp | null;
export const auth: Auth | null;
export const googleProvider: GoogleAuthProvider | null;

/** fetch() carrying the signed-in user's Firebase ID token. Required for every
 *  /api/rooms call — a bare fetch() now comes back 401. */
export function authedFetch(url: string, options?: RequestInit): Promise<Response>;

/** The signed-in user's UID, or null once auth has initialised. */
export function currentUid(): Promise<string | null>;
