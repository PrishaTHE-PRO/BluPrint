// auth.js — verifies Firebase ID tokens server-side and enforces room ownership.
//
// Before this existed the server had no way to tell who was calling it. Every
// route trusted whatever the client claimed: `GET /api/rooms?userId=<anyone>`
// returned that user's rooms, and PATCH/DELETE on a room id worked for anybody
// who knew the id. A Firebase UID is a public-ish identifier, not a secret, so
// "the client sent a userId" was never evidence of anything.
//
// Verification needs the project id only — verifyIdToken checks the JWT against
// Google's published signing keys, so no service-account credential is
// required. On Render, set FIREBASE_PROJECT_ID to the same project the client
// builds against (VITE_FIREBASE_PROJECT_ID).
//
// This fails CLOSED. If the project id is missing, protected routes answer 503
// rather than falling through unauthenticated — an auth layer that silently
// disables itself is worse than none, because it looks like it is working.

const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const Room = require("../models/Room");

const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "";

let ready = false;
if (PROJECT_ID) {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  ready = true;
} else {
  console.error(
    "[auth] FIREBASE_PROJECT_ID is not set. Every authenticated API route will " +
      "reject with 503 until it is. Set it to the same project id the client " +
      "uses (VITE_FIREBASE_PROJECT_ID)."
  );
}

/** Populates req.uid from a verified `Authorization: Bearer <idToken>` header. */
async function requireAuth(req, res, next) {
  if (!ready) {
    return res.status(503).json({ error: "Authentication is not configured on this server." });
  }

  const match = /^Bearer\s+(.+)$/i.exec(String(req.get("authorization") || "").trim());
  if (!match) return res.status(401).json({ error: "Sign in required." });

  try {
    const decoded = await getAuth().verifyIdToken(match[1].trim());
    req.uid = decoded.uid;
    next();
  } catch {
    // Deliberately vague: distinguishing "expired" from "malformed" from
    // "wrong project" only helps someone probing the endpoint.
    res.status(401).json({ error: "Sign in required." });
  }
}

/**
 * Loads req.params.roomId and confirms the caller owns it, leaving the document
 * on req.room so handlers don't fetch it twice.
 *
 * Answers 404 — not 403 — when the room exists but belongs to someone else.
 * A 403 would confirm the id is real, which is exactly what an attacker
 * enumerating ids wants to learn.
 */
async function requireRoomOwner(req, res, next) {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room || room.userId !== req.uid) {
      return res.status(404).json({ error: "Room not found." });
    }
    req.room = room;
    next();
  } catch {
    // A malformed ObjectId throws in the cast; that is a 404, not a 500.
    res.status(404).json({ error: "Room not found." });
  }
}

module.exports = { requireAuth, requireRoomOwner, isAuthConfigured: () => ready };
