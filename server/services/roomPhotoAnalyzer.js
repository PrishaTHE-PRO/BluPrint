// roomPhotoAnalyzer.js: estimate a room's type and size from one photo.
//
// The Photo tab on the dimensions page lets someone skip drawing the room. The
// editor still needs a width and length to build its rectangle and the results
// page still needs a room type to pick furniture, so this asks GPT-4o Vision for
// both. The numbers are a starting point the user can correct, which is why the
// response carries a confidence and the client shows a "switch to Dimensions to
// adjust" note rather than treating them as measured.
//
// Every failure path returns a default instead of throwing. A photo that the
// model cannot read should leave the user on a 12 x 12 room with a note, not on
// a 500 page.

const axios = require("axios");

const DEFAULT_MODEL = "gpt-4o";

// Same limits room-dimensions.html enforces in getDimensionRangeMessage
// (MIN_ROOM_FT / MAX_ROOM_FT). Height has no range check on that page; the
// bounds here just keep a mis-read from producing a 40 ft ceiling.
const MIN_ROOM_FT = 5;
const MAX_ROOM_FT = 50;
const MIN_HEIGHT_FT = 6;
const MAX_HEIGHT_FT = 20;

// Room keys the furniture planner understands (see roomKey in furniturePlanner).
const ROOM_TYPES = ["living", "bedroom", "kitchen", "bathroom", "office", "dining", "nursery"];

const FALLBACK_ESTIMATE = Object.freeze({
  roomType: "living",
  widthFt: 12,
  lengthFt: 12,
  heightFt: 9,
  existingFurniture: [],
  confidence: 0,
  fallback: true,
});

const SYSTEM_PROMPT = `You are an interior designer estimating a room from a single photograph.

Use visible references to judge scale: an interior door is about 80 inches tall and 30 to 36 inches wide, ceilings in homes are usually 8 to 10 feet, a sofa seat is about 18 inches off the floor, a standard sofa is 80 to 90 inches wide, a dining chair is about 18 inches wide, a queen bed is 60 x 80 inches, and floor tiles or planks repeat at regular sizes.

Report the room's floor dimensions in FEET as width (left to right from the camera) and length (near to far), the ceiling height in feet, the room type, and a short list of the furniture already in the room (for example "grey sofa", "wooden coffee table"). Give a confidence from 0 to 1 for the dimension estimate; be honest when the camera angle or a partial view makes it a guess.

Return ONLY JSON matching the schema.`;

const RESPONSE_SCHEMA = {
  name: "room_estimate",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["roomType", "widthFt", "lengthFt", "heightFt", "existingFurniture", "confidence"],
    properties: {
      roomType: { type: "string", enum: ROOM_TYPES },
      widthFt: { type: "number" },
      lengthFt: { type: "number" },
      heightFt: { type: "number" },
      existingFurniture: { type: "array", items: { type: "string" } },
      confidence: { type: "number" },
    },
  },
};

function clamp(value, min, max, fallback) {
  // null and "" coerce to 0, which would clamp up to the minimum and look
  // like a real 5 ft measurement. Missing means missing.
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Coerces a raw model reply into the shape the client relies on. */
function normalizeEstimate(raw) {
  const roomType = ROOM_TYPES.includes(raw?.roomType) ? raw.roomType : FALLBACK_ESTIMATE.roomType;
  const existingFurniture = Array.isArray(raw?.existingFurniture)
    ? raw.existingFurniture.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 12)
    : [];
  return {
    roomType,
    widthFt: Math.round(clamp(raw?.widthFt, MIN_ROOM_FT, MAX_ROOM_FT, FALLBACK_ESTIMATE.widthFt) * 2) / 2,
    lengthFt: Math.round(clamp(raw?.lengthFt, MIN_ROOM_FT, MAX_ROOM_FT, FALLBACK_ESTIMATE.lengthFt) * 2) / 2,
    heightFt: Math.round(clamp(raw?.heightFt, MIN_HEIGHT_FT, MAX_HEIGHT_FT, FALLBACK_ESTIMATE.heightFt) * 2) / 2,
    existingFurniture,
    confidence: clamp(raw?.confidence, 0, 1, 0),
    fallback: false,
  };
}

/**
 * Returns an estimate for the photo at `photoUrl`. Never throws: any failure
 * yields FALLBACK_ESTIMATE (with fallback: true) so the caller can tell the
 * user to adjust rather than trust it.
 */
async function estimateRoom(photoUrl) {
  if (!process.env.OPENAI_API_KEY || !photoUrl) return { ...FALLBACK_ESTIMATE };

  const startedAt = Date.now();
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.OPENAI_STYLE_MODEL || DEFAULT_MODEL,
        response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
        max_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Estimate this room." },
              { type: "image_url", image_url: { url: photoUrl, detail: "high" } },
            ],
          },
        ],
      },
      {
        timeout: 20000,
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    const raw = response?.data?.choices?.[0]?.message?.content;
    if (!raw) return { ...FALLBACK_ESTIMATE };
    const estimate = normalizeEstimate(JSON.parse(raw));
    console.log(
      "[photo-analyze] estimated", estimate.roomType,
      `${estimate.widthFt}x${estimate.lengthFt}x${estimate.heightFt} ft`,
      "confidence", estimate.confidence, "in", Date.now() - startedAt, "ms",
    );
    return estimate;
  } catch (error) {
    const detail = error?.response?.data?.error?.message || error?.message;
    console.error("[photo-analyze] estimate failed, using the default room:", detail || "");
    return { ...FALLBACK_ESTIMATE };
  }
}

module.exports = {
  estimateRoom,
  normalizeEstimate,
  FALLBACK_ESTIMATE,
  ROOM_TYPES,
  MIN_ROOM_FT,
  MAX_ROOM_FT,
  MIN_HEIGHT_FT,
  MAX_HEIGHT_FT,
};
