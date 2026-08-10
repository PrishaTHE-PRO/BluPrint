// furniturePlanner.js — ask GPT-4o WHAT to buy before Serper fetches the actual
// products. Previously the category list came from a fixed table per room type
// (see LAYOUTS in src/utils/furnitureLayout.ts), which ignored the room's size:
// a 6x8 bathroom got a vanity, a tub AND a standing shower whether or not they
// could physically fit.
//
// Flow:
//   1. GPT proposes the set: category, real dimensions, budget split, and a
//      shopping query per pick.
//   2. server/routes/furniture.js runs each search_query through Serper.
//   3. GPT's dimensions are kept for the item, so the 2D plan and 3D room scale
//      to what was actually planned rather than to catalog defaults.
//
// Every failure path returns null so the caller falls back to the fixed table.
// A missing key, a timeout, a malformed reply — none of them should break the
// results page.

const axios = require("axios");

const DEFAULT_MODEL = "gpt-4o";

// Must stay in step with the keys in room3d/furniture-catalog.js — anything
// outside this list has no 2D icon and no 3D model, so it would render as a box.
const ALLOWED_CATEGORIES = [
  "sofa", "coffee_table", "rug", "floor_lamp", "accent_chair", "side_table",
  "bed", "nightstand", "bedroom_rug", "bedside_lamp", "dresser", "wardrobe",
  "island_cart", "bar_stool", "kitchen_rug", "kitchen_storage", "kitchen_shelf", "pendant_light",
  "vanity", "bath_mirror", "bath_storage", "bath_mat", "bath_light", "shower_curtain",
  "bathtub", "standing_shower",
  "desk", "office_chair", "bookshelf", "bookcase", "desk_lamp", "storage_cabinet", "monitor_stand",
  "dining_table", "dining_chair", "dining_rug", "sideboard", "dining_light", "bar_cabinet",
  "crib", "nursery_dresser", "rocking_chair", "nursery_rug", "nursery_shelf", "nursery_lamp",
  "indoor_plants", "wall_art", "floating_shelves", "full_length_mirror", "smart_lighting",
  "reading_nook",
];

const SYSTEM_PROMPT = `You are BluPrint's interior designer. Given a room's type, dimensions, chosen style, colour palette and budget, choose a cohesive furniture set that FITS the room physically and stays within budget.

Rules:
- Only use category keys from the provided allowed list.
- Respect the room footprint: leave roughly 30in walkways and never fill more than about half the floor area. Prefer fewer, well-scaled pieces over clutter.
- A small room gets fewer pieces. Never propose both a bathtub and a standing_shower unless the room is at least 60 sq ft.
- Give realistic real-world dimensions in INCHES for each pick (width along wall, depth, height).
- Split the budget sensibly; anchor pieces (bed/sofa/dining_table) take the larger share.
- style_tags must reflect the requested style so product search returns on-style items.
- search_query is a concise shopping phrase combining style, colour and product.
Return ONLY JSON matching the schema. No commentary.`;

const RESPONSE_SCHEMA = {
  name: "furniture_plan",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["picks", "budget_used_usd"],
    properties: {
      budget_used_usd: { type: "number" },
      picks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["category", "label", "dimensions_in", "style_tags", "est_price_usd", "priority", "search_query", "rationale"],
          properties: {
            category: { type: "string", enum: ALLOWED_CATEGORIES },
            label: { type: "string" },
            dimensions_in: {
              type: "object",
              additionalProperties: false,
              required: ["w", "d", "h"],
              properties: { w: { type: "number" }, d: { type: "number" }, h: { type: "number" } },
            },
            style_tags: { type: "array", items: { type: "string" } },
            est_price_usd: { type: "number" },
            priority: { type: "integer" },
            search_query: { type: "string" },
            rationale: { type: "string" },
          },
        },
      },
    },
  },
};

// Categories that belong in each room. Offering the whole list regardless of
// room type is how a living room ended up with a crib and a nursery rug in it.
const ROOM_CATEGORIES = {
  living: ["sofa", "coffee_table", "rug", "floor_lamp", "accent_chair", "side_table", "bookcase", "reading_nook"],
  bedroom: ["bed", "nightstand", "bedroom_rug", "bedside_lamp", "dresser", "wardrobe", "reading_nook"],
  kitchen: ["island_cart", "bar_stool", "kitchen_rug", "kitchen_storage", "kitchen_shelf", "pendant_light"],
  bathroom: ["vanity", "bath_mirror", "bath_storage", "bath_mat", "bath_light", "shower_curtain", "bathtub", "standing_shower"],
  office: ["desk", "office_chair", "bookshelf", "desk_lamp", "storage_cabinet", "monitor_stand", "bookcase"],
  dining: ["dining_table", "dining_chair", "dining_rug", "sideboard", "dining_light", "bar_cabinet"],
  nursery: ["crib", "nursery_dresser", "rocking_chair", "nursery_rug", "nursery_shelf", "nursery_lamp"],
};

// Decor that suits any room. Deliberately small — these are accents, and the
// piece cap below still applies to them.
const UNIVERSAL_CATEGORIES = ["indoor_plants", "wall_art", "floating_shelves", "smart_lighting"];

function roomKey(roomType) {
  const t = String(roomType || "").toLowerCase();
  if (t.includes("bath")) return "bathroom";
  if (t.includes("kitchen")) return "kitchen";
  if (t.includes("nursery") || t.includes("baby")) return "nursery";
  if (t.includes("dining")) return "dining";
  if (t.includes("office") || t.includes("study") || t.includes("desk")) return "office";
  if (t.includes("bed")) return "bedroom";
  return "living";
}

function categoriesForRoom(roomType) {
  const key = roomKey(roomType);
  const base = ROOM_CATEGORIES[key] || ROOM_CATEGORIES.living;
  // A bathroom does not want a plant-and-wall-art package; everywhere else can.
  // Copy, never the shared array — pushing onto UNIVERSAL_CATEGORIES would grow
  // it by one on every bedroom request for the life of the process.
  const extras = key === "bathroom" ? [] : [...UNIVERSAL_CATEGORIES];
  if (key === "bedroom") extras.push("full_length_mirror");
  return [...new Set([...base, ...extras])].filter((c) => ALLOWED_CATEGORIES.includes(c));
}

/**
 * How many pieces a room should hold. Driven by floor area, not budget — a
 * bigger budget should buy better pieces, not more of them, which is why a high
 * budget used to fill the room with clutter.
 */
function maxPiecesFor(widthFt, lengthFt) {
  const area = Math.max(1, Number(widthFt) * Number(lengthFt));
  return Math.max(3, Math.min(8, Math.round(area / 28)));
}

function buildUserPrompt({ roomType, widthFt, lengthFt, heightFt, style, budgetTotal, features = [], colors = [] }) {
  const allowed = categoriesForRoom(roomType);
  const maxPieces = maxPiecesFor(widthFt, lengthFt);
  return [
    `Room type: ${roomType}`,
    `Dimensions: ${widthFt} ft wide x ${lengthFt} ft long x ${heightFt} ft high (${Math.round(widthFt * lengthFt)} sq ft)`,
    `Style: ${style}`,
    colors.length ? `Colour palette: ${colors.join(", ")}` : "",
    `Budget: ${budgetTotal ? "$" + budgetTotal : "flexible"}`,
    features.length ? `Requested features: ${features.join(", ")}` : "",
    `Choose AT MOST ${maxPieces} pieces. A larger budget means better pieces, not more of them.`,
    `Allowed categories (this room type only): ${allowed.join(", ")}`,
  ].filter(Boolean).join("\n");
}

/**
 * Returns { picks, budgetUsed } or null. Null means "carry on without me" —
 * the caller keeps its fixed category table.
 */
async function planFurniture(room) {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!room || !room.widthFt || !room.lengthFt) return null;

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.OPENAI_PLANNER_MODEL || DEFAULT_MODEL,
        response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
        max_tokens: 900,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(room) },
        ],
      },
      {
        // 30s meant a slow model could hold the whole results page on its own,
        // before a single product search had started. Fall back sooner.
        timeout: 9000,
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    const raw = response?.data?.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const picks = Array.isArray(parsed?.picks) ? parsed.picks : [];

    // Trust nothing: the prompt asks for a scoped list and a piece cap, but a
    // model can ignore both. Enforce them here so a stray crib cannot reach a
    // living room and a big budget cannot fill the floor.
    const allowedHere = new Set(categoriesForRoom(room.roomType));
    const seen = new Set();
    const clean = [];
    for (const pick of picks) {
      const category = String(pick?.category || "");
      if (!allowedHere.has(category) || seen.has(category)) continue;
      const w = Number(pick?.dimensions_in?.w);
      const d = Number(pick?.dimensions_in?.d);
      const h = Number(pick?.dimensions_in?.h);
      if (!Number.isFinite(w) || !Number.isFinite(d) || w <= 0 || d <= 0) continue;
      seen.add(category);
      clean.push({
        category,
        label: String(pick.label || category),
        widthIn: w,
        depthIn: d,
        heightIn: Number.isFinite(h) && h > 0 ? h : undefined,
        estPrice: Number(pick.est_price_usd) || 0,
        priority: Number.isFinite(Number(pick.priority)) ? Number(pick.priority) : 5,
        searchQuery: String(pick.search_query || "").trim(),
        rationale: String(pick.rationale || ""),
      });
    }
    if (!clean.length) return null;

    // Priority 1 is the anchor piece, so trimming from the end drops the most
    // optional things first.
    clean.sort((a, b) => a.priority - b.priority);
    const capped = clean.slice(0, maxPiecesFor(room.widthFt, room.lengthFt));
    return { picks: capped, budgetUsed: Number(parsed?.budget_used_usd) || 0 };
  } catch (error) {
    const detail = error?.response?.data?.error?.message || error?.message;
    console.error("[furniture] planner failed, using the fixed category table:", detail || "");
    return null;
  }
}

module.exports = { planFurniture, ALLOWED_CATEGORIES, buildUserPrompt, SYSTEM_PROMPT, RESPONSE_SCHEMA };
