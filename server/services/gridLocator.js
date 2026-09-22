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
// One coarse pass is not tight enough to wrap a piece: a 12 x 8 grid on a
// 1536 x 1024 render is a 128 px cell. So there is a second pass. Each product
// found in the first pass is cropped out with a one-cell margin, a finer
// 10 x 10 grid is drawn on the crop, and the model is asked again. A cell on
// that grid is a tenth of the crop, which puts the final box within a few
// percent of the piece. The refine pass is best effort: if it fails, the coarse
// boxes stand.
//
// The gridded copies never leave memory: they go to the model as data URLs, so
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

// Refine pass. Ten by ten keeps labels readable on a crop a few hundred pixels
// wide; finer than that and the model cannot read the cells it is meant to use.
const FINE_COLS = 10;
const FINE_ROWS = 10;
const FINE_LABELS = "ABCDEFGHIJ";
// Below this a 10-column grid has 30 px cells and the labels stop being
// readable, so the second look would be guessing again. Such a crop also
// means the coarse box was already about one cell wide, which is tight enough.
const MIN_CROP_PX = 300;
// A "sofa" box spanning most of the frame is a wrong answer, not a big sofa.
const MAX_BOX_AREA = 0.6;

/** SVG grid at the image's exact size: lines plus a label in every cell. */
function gridSvg(width, height, cols = COLS, rows = ROWS, labels = COL_LABELS) {
  const cw = width / cols;
  const ch = height / rows;
  const font = Math.max(10, Math.round(Math.min(cw, ch) * 0.22));
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<style>text{font:700 ${font}px sans-serif;fill:#fff;paint-order:stroke;stroke:#000;stroke-width:${Math.max(2, font / 5)}px;stroke-linejoin:round}</style>`,
  ];
  for (let c = 1; c < cols; c++) {
    const x = (c * cw).toFixed(1);
    parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#fff" stroke-opacity=".9" stroke-width="2"/>`);
    parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#000" stroke-opacity=".6" stroke-width="1" stroke-dasharray="6 6"/>`);
  }
  for (let r = 1; r < rows; r++) {
    const y = (r * ch).toFixed(1);
    parts.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#fff" stroke-opacity=".9" stroke-width="2"/>`);
    parts.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#000" stroke-opacity=".6" stroke-width="1" stroke-dasharray="6 6"/>`);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c * cw + 4).toFixed(1);
      const y = (r * ch + font + 2).toFixed(1);
      parts.push(`<text x="${x}" y="${y}">${labels[c]}${r + 1}</text>`);
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

/**
 * Crop rectangle (fractions) for a coarse box: one coarse cell of margin on
 * every side so a piece that spills past its cells is still in the crop.
 */
function cropRectFor(box) {
  const mx = 1 / COLS;
  const my = 1 / ROWS;
  const x0 = Math.max(0, box.x - mx);
  const y0 = Math.max(0, box.y - my);
  const x1 = Math.min(1, box.x + box.w + mx);
  const y1 = Math.min(1, box.y + box.h + my);
  return { x0, y0, x1, y1 };
}

/** Extracts a crop and draws the fine grid on it. Null if too small to matter. */
async function drawFineCrop(renderPng, width, height, rect) {
  const left = Math.round(rect.x0 * width);
  const top = Math.round(rect.y0 * height);
  const cw = Math.round((rect.x1 - rect.x0) * width);
  const ch = Math.round((rect.y1 - rect.y0) * height);
  if (cw < MIN_CROP_PX || ch < MIN_CROP_PX) return null;
  const buffer = await sharp(renderPng)
    .extract({ left, top, width: cw, height: ch })
    .composite([{ input: Buffer.from(gridSvg(cw, ch, FINE_COLS, FINE_ROWS, FINE_LABELS)), top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
  return { buffer, width: cw, height: ch };
}

/**
 * Maps a fine-grid cell range inside a crop back to fractions of the whole
 * image. Returns null for a missing or malformed range.
 */
function fineCellsToBox(it, rect) {
  if (!it?.found) return null;
  const c0 = Number(it.colStart), c1 = Number(it.colEnd), r0 = Number(it.rowStart), r1 = Number(it.rowEnd);
  if (![c0, c1, r0, r1].every(Number.isInteger)) return null;
  if (c0 < 1 || c1 > FINE_COLS || r0 < 1 || r1 > FINE_ROWS || c1 < c0 || r1 < r0) return null;
  const cropW = rect.x1 - rect.x0;
  const cropH = rect.y1 - rect.y0;
  return {
    x: rect.x0 + ((c0 - 1) / FINE_COLS) * cropW,
    y: rect.y0 + ((r0 - 1) / FINE_ROWS) * cropH,
    w: ((c1 - c0 + 1) / FINE_COLS) * cropW,
    h: ((r1 - r0 + 1) / FINE_ROWS) * cropH,
  };
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

const REFINE_SCHEMA = {
  name: "render_refine_hotspots",
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
          required: ["crop", "found", "colStart", "rowStart", "colEnd", "rowEnd"],
          properties: {
            crop: { type: "integer" },
            found: { type: "boolean" },
            colStart: { type: "integer" },
            rowStart: { type: "integer" },
            colEnd: { type: "integer" },
            rowEnd: { type: "integer" },
          },
        },
      },
    },
  },
};

const REFINE_PROMPT = `You are given close-up crops from a photo of a room. Each crop has a grid drawn over it: columns lettered A to ${FINE_LABELS[FINE_COLS - 1]} left to right, rows numbered 1 to ${FINE_ROWS} top to bottom, every cell labelled.

Each crop is numbered and names one product, and that product's own photo follows it. In the crop, find that product and report the smallest rectangle of grid cells that wraps it completely and tightly: the box must touch the product's outer edges on all four sides and include none of the surrounding floor, wall or other furniture beyond that. colStart/colEnd are column numbers (A=1), rowStart/rowEnd are row numbers, all inclusive. Read the labels off the cells the product occupies; do not estimate. Set found to false if the product is not in the crop.`;

function chatHeaders() {
  return {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  };
}

/**
 * Second pass: one call carrying a fine-gridded crop per found product.
 * Returns a map of category to tight box (fractions of the full image).
 */
async function refineHotspots(renderPng, width, height, coarse, products) {
  const byCategory = new Map(products.map((p) => [String(p.category).toLowerCase(), p]));
  const crops = [];
  for (const box of coarse) {
    const rect = cropRectFor(box);
    const drawn = await drawFineCrop(renderPng, width, height, rect);
    if (!drawn) continue;
    crops.push({ box, rect, drawn, product: byCategory.get(box.category) });
  }
  if (crops.length === 0) return new Map();

  const content = [];
  crops.forEach((c, i) => {
    content.push({ type: "text", text: `Crop ${i + 1}, product "${c.box.category}": ${c.product?.name || c.box.category}.` });
    content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${c.drawn.buffer.toString("base64")}`, detail: "high" } });
    if (c.product?.imageUrl) {
      content.push({ type: "text", text: "Its product photo:" });
      content.push({ type: "image_url", image_url: { url: c.product.imageUrl, detail: "low" } });
    }
  });
  content.push({ type: "text", text: "Return the tight grid cells for every crop above." });

  const response = await axios.post(
    CHAT_URL,
    {
      model: process.env.OPENAI_STYLE_MODEL || DEFAULT_MODEL,
      response_format: { type: "json_schema", json_schema: REFINE_SCHEMA },
      max_tokens: 500,
      messages: [
        { role: "system", content: REFINE_PROMPT },
        { role: "user", content },
      ],
    },
    { timeout: TIMEOUT_MS, headers: chatHeaders() },
  );

  const raw = response?.data?.choices?.[0]?.message?.content;
  const parsed = raw ? JSON.parse(raw) : null;
  const refined = new Map();
  for (const it of Array.isArray(parsed?.items) ? parsed.items : []) {
    const c = crops[Number(it?.crop) - 1];
    if (!c) continue;
    const box = fineCellsToBox(it, c.rect);
    if (!box || box.w * box.h > MAX_BOX_AREA) continue;
    refined.set(c.box.category, box);
    console.log(`[render] ${c.box.category}: refined to ${FINE_LABELS[it.colStart - 1]}${it.rowStart}-${FINE_LABELS[it.colEnd - 1]}${it.rowEnd} of its crop`);
  }
  return refined;
}

/**
 * Asks GPT-4o for each product's cells on the gridded render, then refines
 * each found product on a fine-gridded crop. `products` need category, name
 * and imageUrl. Throws on a coarse-pass failure so the caller can fall back;
 * a refine-pass failure just keeps the coarse boxes.
 */
async function locateOnGrid(renderPng, products) {
  const { buffer, width, height } = await drawGrid(renderPng);
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
    { timeout: TIMEOUT_MS, headers: chatHeaders() },
  );

  const raw = response?.data?.choices?.[0]?.message?.content;
  const parsed = raw ? JSON.parse(raw) : null;
  const coarse = cellsToHotspots(parsed?.items, products);
  if (Array.isArray(parsed?.items)) {
    for (const it of parsed.items) {
      if (it?.found) console.log(`[render] ${it.category}: ${COL_LABELS[it.colStart - 1] || "?"}${it.rowStart}-${COL_LABELS[it.colEnd - 1] || "?"}${it.rowEnd} (${it.where})`);
    }
  }
  if (coarse.length === 0) return coarse;

  // Tighten each box on its own crop. Losing this pass costs precision, not
  // the hotspots, so it must never take the coarse result down with it.
  try {
    const refined = await refineHotspots(renderPng, width, height, coarse, products);
    return coarse.map((box) => (refined.has(box.category) ? { ...box, ...refined.get(box.category) } : box));
  } catch (error) {
    const detail = error?.response?.data?.error?.message || error?.message;
    console.error("[render] refine pass failed, keeping coarse boxes:", detail || "");
    return coarse;
  }
}

module.exports = { locateOnGrid, cellsToHotspots, gridSvg, drawGrid, cropRectFor, fineCellsToBox, drawFineCrop, COLS, ROWS, FINE_COLS, FINE_ROWS };
