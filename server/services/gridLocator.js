// gridLocator.js: find where each product landed in a rendered room.
//
// The first version asked GPT-4o for bounding boxes as fractions of the image.
// Vision models are poor at that; the boxes landed in roughly the right region
// and nowhere near the furniture. What they are good at is reading labels off
// the picture, so this draws a lettered, numbered grid over a copy of the
// render and asks for cell ranges instead ("columns C to E, rows 4 to 6").
// Each product's own photo is sent alongside so the model is matching a known
// object, not guessing from a category name.
//
// The gridded copy never leaves memory: it goes to the model as a data URL, so
// there is nothing extra to store and the saved render stays clean.

const axios = require("axios");
const sharp = require("sharp");

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o";
const TIMEOUT_MS = 25000;

// 12 x 8 on a 3:2 render is a 128 px cell: coarse enough to read, fine enough
// that a nightstand gets its own box rather than sharing one with the bed.
const COLS = 12;
const ROWS = 8;
const COL_LABELS = "ABCDEFGHIJKL";

/** SVG grid at the render's exact size: lines plus a label in every cell. */
function gridSvg(width, height) {
  const cw = width / COLS;
  const ch = height / ROWS;
  const font = Math.max(14, Math.round(Math.min(cw, ch) * 0.22));
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<style>text{font:700 ${font}px sans-serif;fill:#fff;paint-order:stroke;stroke:#000;stroke-width:${Math.max(2, font / 5)}px;stroke-linejoin:round}</style>`,
  ];
  for (let c = 1; c < COLS; c++) {
    const x = (c * cw).toFixed(1);
    parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#fff" stroke-opacity=".9" stroke-width="2"/>`);
    parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#000" stroke-opacity=".6" stroke-width="1" stroke-dasharray="6 6"/>`);
  }
  for (let r = 1; r < ROWS; r++) {
    const y = (r * ch).toFixed(1);
    parts.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#fff" stroke-opacity=".9" stroke-width="2"/>`);
    parts.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#000" stroke-opacity=".6" stroke-width="1" stroke-dasharray="6 6"/>`);
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = (c * cw + 4).toFixed(1);
      const y = (r * ch + font + 2).toFixed(1);
      parts.push(`<text x="${x}" y="${y}">${COL_LABELS[c]}${r + 1}</text>`);
    }
  }
  parts.push("</svg>");
  return parts.join("");
}

/** Composites the grid over the render. Returns a JPEG buffer plus its size. */
async function drawGrid(renderPng) {
  const base = sharp(renderPng);
  const { width, height } = await base.metadata();
  if (!width || !height) throw new Error("render has no dimensions");
  const buffer = await base
    .composite([{ input: Buffer.from(gridSvg(width, height)), top: 0, left: 0 }])
    // JPEG keeps the data URL a few hundred KB instead of a few MB of PNG.
    .jpeg({ quality: 88 })
    .toBuffer();
  return { buffer, width, height };
}

const SCHEMA = {
  name: "render_grid_hotspots",
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
          required: ["category", "found", "colStart", "rowStart", "colEnd", "rowEnd", "where"],
          properties: {
            category: { type: "string" },
            found: { type: "boolean" },
            colStart: { type: "integer" },
            rowStart: { type: "integer" },
            colEnd: { type: "integer" },
            rowEnd: { type: "integer" },
            where: { type: "string" },
          },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You locate furniture in a photo of a room. The photo has a grid drawn over it: columns are lettered A to ${COL_LABELS[COLS - 1]} from left to right and rows are numbered 1 to ${ROWS} from top to bottom, and every cell shows its own label such as C4.

For each requested product you will be shown its product photo. Find that exact product in the room and report the smallest rectangle of grid cells that fully contains it: colStart/colEnd are column numbers (A=1, B=2, ...) and rowStart/rowEnd are row numbers, all inclusive. Read the labels off the cells the product actually occupies; do not estimate.

Set found to false if the product is not visible in the room. Use the category key exactly as given. In "where", say in a few words where the product is (for example "left wall under the window").`;

/**
 * Converts inclusive cell ranges into fractions of the image, dropping
 * anything missing, out of range, or inside out.
 */
function cellsToHotspots(items, products) {
  if (!Array.isArray(items)) return [];
  const idFor = new Map(products.map((p) => [String(p.category).toLowerCase(), String(p.id)]));
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const category = String(it?.category || "").trim().toLowerCase();
    if (!it?.found || !idFor.has(category) || seen.has(category)) continue;
    const c0 = Number(it.colStart), c1 = Number(it.colEnd), r0 = Number(it.rowStart), r1 = Number(it.rowEnd);
    if (![c0, c1, r0, r1].every(Number.isInteger)) continue;
    if (c0 < 1 || c1 > COLS || r0 < 1 || r1 > ROWS || c1 < c0 || r1 < r0) continue;
    seen.add(category);
    out.push({
      category,
      itemId: idFor.get(category),
      x: (c0 - 1) / COLS,
      y: (r0 - 1) / ROWS,
      w: (c1 - c0 + 1) / COLS,
      h: (r1 - r0 + 1) / ROWS,
    });
  }
  return out;
}

/**
 * Asks GPT-4o for each product's cells on the gridded render. `products` need
 * category, name and imageUrl. Returns [] on any failure so the caller can
 * still ship the picture.
 */
async function locateOnGrid(renderPng, products) {
  const { buffer } = await drawGrid(renderPng);
  const dataUrl = `data:image/jpeg;base64,${buffer.toString("base64")}`;

  const content = [
    { type: "text", text: "Room photo with the grid:" },
    { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
  ];
  products.forEach((p, i) => {
    content.push({ type: "text", text: `Product ${i + 1}, category "${p.category}": ${p.name}${p.brand ? ` by ${p.brand}` : ""}. Its photo:` });
    // Low detail is plenty to recognise a product; it keeps the call cheap.
    content.push({ type: "image_url", image_url: { url: p.imageUrl, detail: "low" } });
  });
  content.push({ type: "text", text: "Return the grid cells for every product listed above." });

  const response = await axios.post(
    CHAT_URL,
    {
      model: process.env.OPENAI_STYLE_MODEL || DEFAULT_MODEL,
      response_format: { type: "json_schema", json_schema: SCHEMA },
      max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
    },
    {
      timeout: TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    },
  );

  const raw = response?.data?.choices?.[0]?.message?.content;
  const parsed = raw ? JSON.parse(raw) : null;
  const hotspots = cellsToHotspots(parsed?.items, products);
  if (Array.isArray(parsed?.items)) {
    for (const it of parsed.items) {
      if (it?.found) console.log(`[render] ${it.category}: ${COL_LABELS[it.colStart - 1] || "?"}${it.rowStart}-${COL_LABELS[it.colEnd - 1] || "?"}${it.rowEnd} (${it.where})`);
    }
  }
  return hotspots;
}

module.exports = { locateOnGrid, cellsToHotspots, gridSvg, drawGrid, COLS, ROWS };
