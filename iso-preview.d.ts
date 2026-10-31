// Hand-written declarations for the plain-JS preview renderer, so the TS pages
// that import it type-check. Signatures kept loose on purpose — the module
// takes the same room shape the rest of the app passes around.
export function renderIsoRoom(room: unknown, options?: unknown): string;
export function renderRoomPreview(room: unknown, options?: unknown): string;
export function renderRoomPreviewFlat(room: unknown, options?: unknown): string;
export function renderProjectRoomPreview(room: unknown): string;
export function getRoomPreviewLayout(room: unknown): unknown;
export function escapeHtml(value: unknown): string;
