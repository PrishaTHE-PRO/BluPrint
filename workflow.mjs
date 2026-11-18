// Keeps the three-step flow in order: Define Room, then Add Inspiration, then
// View Design. Each later page calls gateWorkflow() as it loads. If the step
// before it was never finished, the visitor is sent back to that step with a
// short note saying why, instead of landing on a page that has nothing to
// show and whose buttons would fail one by one.
//
// What counts as done is read from the server, not from localStorage alone:
// a room id in storage may belong to a room that was deleted, and a style
// may have been saved on another device. When the API cannot be reached the
// page is allowed to open, since its own error handling covers that case.

import { authedFetch, currentUid } from "./firebase.mjs";

const ROOM_KEY = "blueprintCurrentRoomId";

function leave(href) {
    window.location.replace(href);
    // Never resolves: the page is going away, so nothing after it should run.
    return new Promise(() => {});
}

/**
 * @param {"inspo" | "result"} page  which page is loading
 * @returns {Promise<object | null>} the room from the API when the page may
 *   open, or null when the check could not be completed (not signed in,
 *   API unreachable). Redirects, and never resolves, when a step is missing.
 */
export async function gateWorkflow(page) {
    const roomId = localStorage.getItem(ROOM_KEY);
    if (!roomId) return leave("room-dimensions.html?missing=room");

    const uid = await currentUid();
    if (!uid) return null; // the page's own sign-in handling takes over

    let rooms;
    try {
        const res = await authedFetch("/api/rooms");
        if (!res.ok) return null;
        rooms = await res.json();
    } catch {
        return null;
    }

    const room = Array.isArray(rooms) ? rooms.find((r) => r && r._id === roomId) : null;
    if (!room) {
        localStorage.removeItem(ROOM_KEY);
        return leave("room-dimensions.html?missing=room");
    }

    // The results page needs a style: either the one picked on the inspiration
    // page or, for older rooms, a furniture layout that already exists.
    if (page === "result" && !room.style && !room.furnitureLayout) {
        return leave("inspo-upload.html?missing=style");
    }
    return room;
}

/** The ?missing= reason this page was sent back with, if any. Clears it from
 *  the address bar so a reload does not repeat the note. */
export function takeMissingReason() {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("missing");
    if (!reason) return null;
    params.delete("missing");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? "?" + rest : "") + window.location.hash);
    return reason;
}
