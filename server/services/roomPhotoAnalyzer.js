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
const { ALLOWED_CATEGORIES, maxPiecesFor } = require("./furniturePlanner");

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

// What the picture actually shows. Only "room_interior" can be estimated;
// the route turns anything else into a "please upload a photo of your room".
const SUBJECTS = [
  "room_interior",
  "floor_plan",
  "building_exterior",
  "single_object",
  "people",
  "screenshot_or_document",
  "other",
];

const FALLBACK_ESTIMATE = Object.freeze({
  isRoomPhoto: true,
  subject: "room_interior",
  roomType: "living",
  widthFt: 12,
  lengthFt: 12,
  heightFt: 9,
  existingFurniture: [],
  crowded: false,
  full: false,
  confidence: 0,
  fallback: true,
});

/**
 * Existing furniture as { label, category, keep }. Accepts the old plain
 * string form too, so a room saved before this change still reads. `keep`
 * defaults to true; the dimensions page flips it when the user marks a
 * piece for replacement.
 */
function normalizeExistingFurniture(list) {
  if (!Array.isArray(list)) return [];
  const valid = new Set([...ALLOWED_CATEGORIES, "other"]);
  const out = [];
  for (const entry of list.slice(0, 16)) {
    const label = String((entry && typeof entry === "object" ? entry.label : entry) || "").trim().slice(0, 60);
    if (!label) continue;
    const rawCat = entry && typeof entry === "object" ? String(entry.category || "other").toLowerCase() : "other";
    out.push({
      label,
      category: valid.has(rawCat) ? rawCat : "other",
      keep: entry && typeof entry === "object" && entry.keep === false ? false : true,
    });
  }
  return out;
}

/**
 * Whether the room is at capacity for its size. Counts every kept piece,
 * "other" included (a TV stand takes floor space whatever we call it), against
 * the same per-area cap the planner uses, and also honours the model's own
 * crowded call once the room is within one piece of that cap.
 */
function isRoomFull({ widthFt, lengthFt, existingFurniture = [], crowded = false }) {
  const kept = existingFurniture.filter((f) => f && f.keep !== false).length;
  const cap = maxPiecesFor(widthFt, lengthFt);
  return kept >= cap || (Boolean(crowded) && kept >= cap - 1);
}

const SYSTEM_PROMPT = `You are an interior designer estimating a room from a single photograph.

First decide what the image is. It counts as a room photo (isRoomPhoto true, subject "room_interior") only when it is a photograph or realistic rendering taken INSIDE a room, showing its floor and at least one wall as a person standing in it would see them. A floor plan, blueprint, sketch, drawing or diagram of a layout is "floor_plan". The outside of a house or building is "building_exterior". A close-up of one piece of furniture or decor with no sense of the room is "single_object". A photo mostly of people or pets is "people". A screenshot, web page, document or text is "screenshot_or_document". Anything else that is not a room interior is "other". When isRoomPhoto is false, still fill the remaining fields with sensible defaults and set confidence to 0.

Use visible references to judge scale: an interior door is about 80 inches tall and 30 to 36 inches wide, ceilings in homes are usually 8 to 10 feet, a sofa seat is about 18 inches off the floor, a standard sofa is 80 to 90 inches wide, a dining chair is about 18 inches wide, a queen bed is 60 x 80 inches, and floor tiles or planks repeat at regular sizes.

Report the room's floor dimensions in FEET as width (left to right from the camera) and length (near to far), the ceiling height in feet, and the room type.

List every piece of furniture already in the room. For each give a short label (for example "grey sofa", "wooden coffee table") and the closest category from the allowed list; use "other" for anything that is not on the list (a TV, curtains, a radiator). Then say whether the room already looks fully furnished (crowded): true when there is little floor or wall space left for more pieces.

Give a confidence from 0 to 1 for the dimension estimate; be honest when the camera angle or a partial view makes it a guess.

Return ONLY JSON matching the schema.`;

const RESPONSE_SCHEMA = {
  name: "room_estimate",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["isRoomPhoto", "subject", "roomType", "widthFt", "lengthFt", "heightFt", "existingFurniture", "crowded", "confidence"],
    properties: {
      isRoomPhoto: { type: "boolean" },
      subject: { type: "string", enum: SUBJECTS },
      roomType: { type: "string", enum: ROOM_TYPES },
      widthFt: { type: "number" },
      lengthFt: { type: "number" },
      heightFt: { type: "number" },
      existingFurniture: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "category"],
          properties: {
            label: { type: "string" },
            category: { type: "string", enum: [...ALLOWED_CATEGORIES, "other"] },
          },
        },
      },
      crowded: { type: "boolean" },
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
  const existingFurniture = normalizeExistingFurniture(raw?.existingFurniture);
  const widthFt = Math.round(clamp(raw?.widthFt, MIN_ROOM_FT, MAX_ROOM_FT, FALLBACK_ESTIMATE.widthFt) * 2) / 2;
  const lengthFt = Math.round(clamp(raw?.lengthFt, MIN_ROOM_FT, MAX_ROOM_FT, FALLBACK_ESTIMATE.lengthFt) * 2) / 2;
  const crowded = Boolean(raw?.crowded);
  const subject = SUBJECTS.includes(raw?.subject) ? raw.subject : "room_interior";
  // Only an explicit "no" rejects the picture; a missing flag reads as a room.
  const isRoomPhoto = raw?.isRoomPhoto !== false && subject === "room_interior";
  return {
    isRoomPhoto,
    subject,
    roomType,
    widthFt,
    lengthFt,
    heightFt: Math.round(clamp(raw?.heightFt, MIN_HEIGHT_FT, MAX_HEIGHT_FT, FALLBACK_ESTIMATE.heightFt) * 2) / 2,
    existingFurniture,
    crowded,
    full: isRoomFull({ widthFt, lengthFt, existingFurniture, crowded }),
    confidence: clamp(raw?.confidence, 0, 1, 0),
    fallback: false,
  };
}

/** The message shown when the upload is not a photo taken inside a room. */
function notARoomMessage(subject) {
  const what = {
    floor_plan: "That looks like a floor plan, not a photo of your room.",
    building_exterior: "That looks like the outside of a building, not a photo of your room.",
    single_object: "That looks like a close-up of one item, not a photo of your room.",
    people: "That looks like a photo of people, not of your room.",
    screenshot_or_document: "That looks like a screenshot or document, not a photo of your room.",
  }[subject] || "That does not look like a photo of a room.";
  return what + " Upload a picture taken inside the room, showing the floor and walls. To use a floor plan or measurements instead, switch to Draw Room.";
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
      "[photo-analyze] estimated", estimate.isRoomPhoto ? estimate.roomType : `NOT A ROOM (${estimate.subject})`,
      `${estimate.widthFt}x${estimate.lengthFt}x${estimate.heightFt} ft`,
      "confidence", estimate.confidence,
      "existing:", estimate.existingFurniture.map((f) => `${f.label} (${f.category})`).join(", ") || "none",
      estimate.full ? "FULL" : "",
      "in", Date.now() - startedAt, "ms",
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
  notARoomMessage,
  normalizeEstimate,
  normalizeExistingFurniture,
  isRoomFull,
  FALLBACK_ESTIMATE,
  ROOM_TYPES,
  MIN_ROOM_FT,
  MAX_ROOM_FT,
  MIN_HEIGHT_FT,
  MAX_HEIGHT_FT,
};
