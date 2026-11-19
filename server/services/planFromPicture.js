// planFromPicture.js: where each piece stands on the floor plan, read off the
// picture by the vision model.
//
// The geometric projection in roomRenderer (box bottom on a floor trapezoid)
// needs three things a single photo does not give reliably: the back wall's
// floor line, the camera's field of view and the horizon. When any of them
// is off, depth is off by half a room. What a vision model is good at is the
// arrangement itself: the sofa is against the window wall, the coffee table
// a couple of feet in front of it, the chair by the right wall turned toward
// the sofa. So this asks for exactly that, in feet, with the room's size and
// each piece's size as the ruler. The geometry stays as the fallback for any
// piece this pass does not place.

const axios = require("axios");

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o";
const TIMEOUT_MS = 25000;

const WALLS = ["none", "back wall", "left wall", "right wall", "front wall"];
const FACINGS = ["camera", "back wall", "left wall", "right wall"];
const LONG_SIDES = ["across", "toward camera", "square"];

const SCHEMA = {
  name: "plan_from_picture",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["category", "found", "fromLeftFt", "fromBackFt", "touching", "facing", "longSide"],
          properties: {
            category: { type: "string" },
            found: { type: "boolean" },
            fromLeftFt: { type: "number" },
            fromBackFt: { type: "number" },
            touching: { type: "string", enum: WALLS },
            facing: { type: "string", enum: FACINGS },
            longSide: { type: "string", enum: LONG_SIDES },
          },
        },
      },
    },
  },
};

function systemPrompt(widthFt, lengthFt) {
  return `You read a photo of a furnished room and describe where each piece stands, as a floor plan.

The room is a rectangle ${widthFt} ft wide and ${lengthFt} ft deep. The camera stands at the front wall and faces the back wall, so the back wall runs across the picture, the left wall is on the left and the right wall on the right. The photo usually shows only the far part of the room: nothing visible stands near the front wall unless the bottom edge of the picture cuts it off.

For each piece report the centre of its footprint on the floor:
- fromLeftFt: feet from the left wall to the centre, 0 to ${widthFt}.
- fromBackFt: feet from the back wall to the centre, 0 at the back wall up to ${lengthFt} at the front wall.
The sizes given for each piece are your ruler. A piece standing against a wall has its centre half its depth from that wall, so count: the gap of clear floor between the wall and the piece's nearest edge, plus half the piece's depth. Worked example: a sofa 40 in deep against the back wall is at fromBackFt 1.7; a coffee table 24 in deep with 1.5 ft of floor between it and that sofa is at 3.3 + 1.5 + 1.0 = 5.8; a rug 8 x 10 ft that starts just in front of the same sofa has its centre about 4 ft further in than its near edge. Keep things that stand together close together: a side table is right next to the seat it serves, a plant on a table is where the table is.

touching: the wall the piece stands against or hangs on, or "none". Beds, sofas, dressers, desks, shelves and cabinets nearly always stand with their back to a wall; say which one, judging by the wall they are nearest and parallel to. For wall art, mirrors, shelves and ceiling lights give the wall they are on and the position along it.
The pieces are placed relative to one another, so read them as a group, not one at a time. A nightstand, bedside lamp or side table stands beside the bed or seat it serves, against the SAME wall as that bed or seat, and on the side of it that the picture shows. Pieces standing side by side along one wall all touch that wall and keep their left-to-right order from the picture. A piece in a corner touches the wall its back is parallel to, not the wall it merely stands near: a nightstand whose front faces the camera is against the back wall even when it is also close to the left wall. Pieces marked "already in the room" are real furniture in the photo; place everything else in relation to them.
facing: where the piece's front points. "camera" means it faces the viewer.
longSide: for a piece that is longer one way than the other, whether its longer side runs across the picture (parallel to the back wall) or toward the camera; "square" when it is about as wide as it is deep.
Set found to false if the piece is not visible. Use the category key exactly as given.`;
}

function chatHeaders() {
  return {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function sizeText(p) {
  const w = Number(p.widthIn), d = Number(p.depthIn);
  if (!w || !d) return "";
  return ` It is ${Math.round(w)} in wide and ${Math.round(d)} in deep.`;
}

/**
 * Asks for the floor plan position of every located product. `hotspots` are
 * the boxes from the locate pass, used only to list what is in the picture
 * and, when they carry a `where` note, to point the model at it.
 * Returns a Map of category -> { cx, cy, touching, facing } in feet, or an
 * empty Map on any failure. Never throws: the caller has a fallback.
 */
async function describeLayout({ image, imageUrl, products, hotspots, room }) {
  const W = Number(room?.widthFt) || 0;
  const L = Number(room?.lengthFt) || 0;
  const out = new Map();
  if (!W || !L || !Array.isArray(hotspots) || hotspots.length === 0 || !process.env.OPENAI_API_KEY) return out;

  const byCategory = new Map(products.map((p) => [String(p.category).toLowerCase(), p]));
  const url = image ? `data:image/jpeg;base64,${image.toString("base64")}` : imageUrl;
  if (!url) return out;

  const lines = hotspots.map((h) => {
    const p = byCategory.get(h.category) || {};
    const where = h.where ? ` In the picture: ${h.where}.` : "";
    const existing = p.existing ? " (already in the room)" : "";
    return `- "${h.category}": ${p.name || h.category}${existing}.${sizeText(p)}${where}`;
  });
  const content = [
    { type: "text", text: "The room:" },
    { type: "image_url", image_url: { url, detail: "high" } },
    { type: "text", text: `Pieces to place:\n${lines.join("\n")}\n\nReturn a plan position for every piece listed.` },
  ];

  try {
    const response = await axios.post(
      CHAT_URL,
      {
        model: process.env.OPENAI_STYLE_MODEL || DEFAULT_MODEL,
        response_format: { type: "json_schema", json_schema: SCHEMA },
        max_tokens: 900,
        messages: [
          { role: "system", content: systemPrompt(W, L) },
          { role: "user", content },
        ],
      },
      { timeout: TIMEOUT_MS, headers: chatHeaders() },
    );
    const raw = response?.data?.choices?.[0]?.message?.content;
    const parsed = raw ? JSON.parse(raw) : null;
    for (const it of Array.isArray(parsed?.items) ? parsed.items : []) {
      const category = String(it?.category || "").trim().toLowerCase();
      if (!it?.found || out.has(category) || !byCategory.has(category)) continue;
      const cx = Number(it.fromLeftFt), cy = Number(it.fromBackFt);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      out.set(category, {
        cx: Math.min(W, Math.max(0, cx)),
        cy: Math.min(L, Math.max(0, cy)),
        touching: WALLS.includes(it.touching) ? it.touching : "none",
        facing: FACINGS.includes(it.facing) ? it.facing : "camera",
        longSide: LONG_SIDES.includes(it.longSide) ? it.longSide : "square",
      });
      console.log(`[plan] ${category}: ${cx.toFixed(1)} ft from left, ${cy.toFixed(1)} ft from back, touching ${it.touching}, facing ${it.facing}, long side ${it.longSide}`);
    }
  } catch (error) {
    const detail = error?.response?.data?.error?.message || error?.message;
    console.error("[plan] layout pass failed, falling back to the floor projection:", detail || "");
  }
  return out;
}

module.exports = { describeLayout, SCHEMA, systemPrompt };
