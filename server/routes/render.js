// render.js: POST /api/rooms/:roomId/render
//
// Composites the currently visible furniture into the room's photo (see
// services/roomRenderer.js) and stores the result on the room. Only the client
// buttons call this; it never runs on page load or on a furniture drag,
// because each call costs far more than a chat completion.

const express = require("express");
const Room = require("../models/Room");
const { requireAuth, requireRoomOwner } = require("../middleware/auth");
const { assertPublicUrl } = require("../utils/safeRequest");
const { renderRoom } = require("../services/roomRenderer");

const router = express.Router();
router.use(requireAuth);

const MAX_ITEMS = 8;
const MAX_HINTS = 8;
const MAX_HINT_LENGTH = 120;

/** Returns the cleaned body or throws an Error with a client-facing message. */
function validateBody(body) {
  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items || items.length < 1 || items.length > MAX_ITEMS) {
    throw new Error(`items must be an array of 1 to ${MAX_ITEMS} products`);
  }

  const cleanItems = items.map((raw, i) => {
    if (!raw || typeof raw !== "object") throw new Error(`items[${i}] must be an object`);
    const id = String(raw.id || "").trim();
    const category = String(raw.category || "").trim();
    const name = String(raw.name || "").trim();
    if (!id || !category || !name) throw new Error(`items[${i}] needs id, category and name`);

    // Both URLs are fetched or linked server-side; a private address here is
    // the same SSRF the image proxy had.
    let imageUrl, buyUrl;
    try {
      imageUrl = assertPublicUrl(String(raw.imageUrl || "")).href;
      buyUrl = assertPublicUrl(String(raw.buyUrl || "")).href;
    } catch {
      throw new Error(`items[${i}] has an invalid imageUrl or buyUrl`);
    }

    return {
      id,
      category,
      name: name.slice(0, 160),
      brand: String(raw.brand || "").trim().slice(0, 80),
      price: Number.isFinite(Number(raw.price)) ? Number(raw.price) : 0,
      imageUrl,
      buyUrl,
    };
  });

  const hints = body?.layoutHints === undefined ? [] : body.layoutHints;
  if (!Array.isArray(hints) || hints.length > MAX_HINTS) {
    throw new Error(`layoutHints must be an array of at most ${MAX_HINTS} strings`);
  }
  const cleanHints = hints.map((h, i) => {
    if (typeof h !== "string" || h.length > MAX_HINT_LENGTH) {
      throw new Error(`layoutHints[${i}] must be a string of at most ${MAX_HINT_LENGTH} characters`);
    }
    return h.trim();
  }).filter(Boolean);

  return { items: cleanItems, layoutHints: cleanHints };
}

router.post("/:roomId/render", requireRoomOwner, async (req, res) => {
  let payload;
  try {
    payload = validateBody(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const room = req.room;
  if (!room.photoUrl) {
    return res.status(400).json({ error: "This room has no photo to render into." });
  }

  try {
    const render = await renderRoom({
      photoUrl: room.photoUrl,
      items: payload.items,
      layoutHints: payload.layoutHints,
      existingFurniture: Array.isArray(room.photoEstimate?.existingFurniture)
        ? room.photoEstimate.existingFurniture
        : [],
    });
    room.render = render;
    room.markModified("render");
    await room.save();
    res.json(render);
  } catch (error) {
    console.error("[render] failed:", error?.message || error);
    // Upstream trouble of any kind is a 502 from the client's point of view;
    // the message carries the model's own error text when there is one.
    res.status(502).json({ error: error?.message || "Render failed" });
  }
});

module.exports = router;
module.exports.validateBody = validateBody;
module.exports.Room = Room;
