// roomRenderer.js: put the recommended products into the user's own room photo.
//
// The 3D and isometric views can only draw generic stand-ins from the furniture
// catalog, so the sofa on screen was never the sofa we recommended. When a room
// has a photo we instead ask the OpenAI image edit endpoint to composite the
// real product photos into it, then ask GPT-4o Vision where each product ended
// up so the client can draw hover hotspots with Buy links.
//
// Endpoint facts this file depends on (checked against the OpenAI docs and the
// openai-node SDK types, not assumed):
//   - POST /v1/images/edits is multipart; multiple input images are sent as
//     repeated `image[]` fields, the first being the image to edit.
//   - gpt-image-1 accepts up to 16 input images per request.
//   - size is one of 1024x1024, 1536x1024, 1024x1536, auto.
//   - quality is one of low, medium, high, auto.
//   - a mask is optional.
//   - input_fidelity: "high" makes the model preserve the input image's
//     details; models that do not support it reject the parameter with a 400.
//   - GPT image models always return b64_json; there is no url option.
//
// Hotspots come from gridLocator.js: a lettered grid is drawn over the render
// and GPT-4o reports cell ranges, which it reads far more reliably than the
// fractional coordinates the first version asked for. If that pass throws,
// the older fraction-based pass below runs as a fallback.
//
// Failure policy: a product whose thumbnail cannot be fetched is skipped, never
// fatal. A hotspot pass that fails still returns the picture with no hotspots.
// Only the image edit itself failing is an error, because there is nothing to
// show without it.

const axios = require("axios");
const sharp = require("sharp");
const { httpAgent, httpsAgent } = require("../utils/safeRequest");
const { uploadToCloudinary } = require("../utils/cloudinary");
const { locateOnGrid } = require("./gridLocator");

const IMAGE_EDIT_URL = "https://api.openai.com/v1/images/edits";
const CHAT_URL = "https://api.openai.com/v1/chat/completions";

const DEFAULT_IMAGE_MODEL = "gpt-image-1";
const DEFAULT_IMAGE_SIZE = "1536x1024";
const DEFAULT_IMAGE_QUALITY = "medium";
// On by default: the whole point is to keep the user's room recognisably
// theirs, and without this the model treats the photo as loose inspiration.
const DEFAULT_INPUT_FIDELITY = "high";
const DEFAULT_HOTSPOT_MODEL = "gpt-4o";

// Room photo plus references must stay within the 16-image cap. The route caps
// items at 8 anyway; this is the hard stop if that ever loosens.
const MAX_REFERENCE_IMAGES = 15;
const DOWNLOAD_TIMEOUT_MS = 10000;
const DOWNLOAD_MAX_BYTES = 8 * 1024 * 1024;
const EDIT_TIMEOUT_MS = 120000;
const HOTSPOT_TIMEOUT_MS = 20000;

/** Fetches an image through the SSRF-guarded agents. Resolves null on any failure. */
async function downloadImage(url) {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxRedirects: 3,
      maxContentLength: DOWNLOAD_MAX_BYTES,
      maxBodyLength: DOWNLOAD_MAX_BYTES,
      httpAgent,
      httpsAgent,
      headers: { Accept: "image/*,*/*;q=0.8" },
    });
    const contentType = String(response.headers["content-type"] || "").split(";")[0].trim();
    if (!contentType.startsWith("image/")) return null;
    return { buffer: Buffer.from(response.data), contentType };
  } catch (error) {
    console.warn("[render] could not fetch image", url, error?.message || "");
    return null;
  }
}

function extensionFor(contentType) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

/**
 * Output size matched to the photo's own orientation. A fixed 3:2 output
 * forced portrait and squarish photos to be reframed, which changed the room
 * before a single piece of furniture was placed. OPENAI_IMAGE_SIZE still wins
 * when set explicitly.
 */
async function pickSize(roomImage) {
  if (process.env.OPENAI_IMAGE_SIZE) return process.env.OPENAI_IMAGE_SIZE;
  try {
    const { width, height } = await sharp(roomImage.buffer).metadata();
    if (width && height) {
      // Nearest available aspect, compared in log space so 4:3 and 3:4 are
      // treated symmetrically. A 4:3 photo lands on 3:2, which crops less of
      // it than squaring it would.
      const target = Math.log(width / height);
      const options = [["1536x1024", 1.5], ["1024x1024", 1], ["1024x1536", 1 / 1.5]];
      return options.reduce((best, opt) =>
        Math.abs(Math.log(opt[1]) - target) < Math.abs(Math.log(best[1]) - target) ? opt : best,
      )[0];
    }
  } catch (error) {
    console.warn("[render] could not read the photo's size, using the default:", error?.message || "");
  }
  return DEFAULT_IMAGE_SIZE;
}

/**
 * The instruction to the image model. Products are numbered to match the
 * order of the reference images that follow the room photo, so "reference 2"
 * is unambiguous.
 */
function buildEditPrompt({ products, layoutHints, existingFurniture }) {
  const hintFor = new Map();
  for (const hint of layoutHints || []) {
    const [category] = String(hint).split(":");
    if (category) hintFor.set(category.trim().toLowerCase(), String(hint).trim());
  }

  const lines = products.map((p, i) => {
    const hint = hintFor.get(String(p.category).toLowerCase());
    const placement = hint ? ` Placement: ${hint.replace(/^[^:]+:\s*/, "")}.` : "";
    return `${i + 1}. ${p.name}${p.brand ? ` by ${p.brand}` : ""} (reference image ${i + 2}).${placement}`;
  });

  const removal = existingFurniture && existingFurniture.length
    ? `Remove the existing furniture that these new pieces replace (currently in the room: ${existingFurniture.join(", ")}).`
    : "Remove any existing furniture that the new pieces replace.";

  return [
    "The first image is a photograph of the user's actual room. This is an edit of that photograph, not a new picture inspired by it.",
    "Keep everything that is not furniture exactly as it is in the photo: the walls and their colour, the floor and its material, the ceiling, every window and door and what is visible through them, curtains and blinds, radiators, light fixtures, wall art, the time of day and the lighting, and the camera position, angle and framing. Do not repaint, restyle, brighten, crop, or reframe the room.",
    removal,
    "Do not remove, move, or alter anything that is not furniture being replaced.",
    "Place each of the following products in the room, matching its reference image as closely as possible in shape, colour, and material, at a realistic size for the room:",
    ...lines,
    "Photorealistic result with perspective, shadows and lighting consistent with the original photo. No text, labels, or watermarks.",
  ].join("\n");
}

/** Builds the multipart body. `inputFidelity` null leaves the field out. */
function buildEditForm({ roomImage, references, prompt, size, inputFidelity }) {
  const form = new FormData();
  form.append("model", process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL);
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("size", size);
  form.append("quality", process.env.OPENAI_IMAGE_QUALITY || DEFAULT_IMAGE_QUALITY);
  if (inputFidelity) form.append("input_fidelity", inputFidelity);

  form.append(
    "image[]",
    new Blob([roomImage.buffer], { type: roomImage.contentType }),
    `room.${extensionFor(roomImage.contentType)}`,
  );
  references.forEach((ref, i) => {
    form.append(
      "image[]",
      new Blob([ref.buffer], { type: ref.contentType }),
      `product-${i + 1}.${extensionFor(ref.contentType)}`,
    );
  });
  return form;
}

/** True when a 400 is the model refusing the input_fidelity parameter itself. */
function rejectsInputFidelity(status, message) {
  return status === 400 && /input_fidelity/i.test(String(message || ""));
}

/**
 * One multipart call to the image edit endpoint. Returns a PNG buffer.
 *
 * input_fidelity is sent by default. If the configured model answers 400
 * naming that parameter, the call is retried once without it: a model that
 * cannot hold the room steady is still better than no render at all, and the
 * log says which happened.
 */
async function editImage({ roomImage, references, prompt, size }) {
  const wanted = process.env.OPENAI_IMAGE_INPUT_FIDELITY || DEFAULT_INPUT_FIDELITY;
  const fidelity = wanted === "off" ? null : wanted;
  try {
    return await postEdit(buildEditForm({ roomImage, references, prompt, size, inputFidelity: fidelity }));
  } catch (error) {
    if (!fidelity || !rejectsInputFidelity(error?.status, error?.message)) throw error;
    console.warn(`[render] ${process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL} rejected input_fidelity, retrying without it. The room will be held less faithfully.`);
    return postEdit(buildEditForm({ roomImage, references, prompt, size, inputFidelity: null }));
  }
}

async function postEdit(form) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EDIT_TIMEOUT_MS);
  try {
    const response = await fetch(IMAGE_EDIT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data?.error?.message || `image edit failed (${response.status})`;
      const err = new Error(message);
      err.status = response.status;
      throw err;
    }
    if (data?.usage) console.log("[render] image usage", JSON.stringify(data.usage));
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("image edit returned no image data");
    return Buffer.from(b64, "base64");
  } finally {
    clearTimeout(timer);
  }
}

const HOTSPOT_SCHEMA = {
  name: "render_hotspots",
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
          required: ["category", "found", "x", "y", "w", "h"],
          properties: {
            category: { type: "string" },
            found: { type: "boolean" },
            x: { type: "number" },
            y: { type: "number" },
            w: { type: "number" },
            h: { type: "number" },
          },
        },
      },
    },
  },
};

/**
 * Fallback only: asks GPT-4o for boxes as fractions of the image. Kept because
 * it needs nothing but the render URL, so it still works if the grid pass
 * cannot run. Returns [] on any failure.
 */
async function locateProductsByFraction(renderUrl, products) {
  const labels = products.map((p) => `${p.category}: ${p.name}`).join("\n");
  try {
    const response = await axios.post(
      CHAT_URL,
      {
        model: process.env.OPENAI_STYLE_MODEL || DEFAULT_HOTSPOT_MODEL,
        response_format: { type: "json_schema", json_schema: HOTSPOT_SCHEMA },
        max_tokens: 600,
        messages: [
          {
            role: "system",
            content:
              "You locate furniture in a rendered room photo. For each requested product, return a tight bounding box as fractions of the image width and height, with x,y at the top-left corner. Set found to false if the product is not visible. Use the category key exactly as given.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Locate each of these products:\n${labels}` },
              { type: "image_url", image_url: { url: renderUrl, detail: "high" } },
            ],
          },
        ],
      },
      {
        timeout: HOTSPOT_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    const raw = response?.data?.choices?.[0]?.message?.content;
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizeHotspots(parsed?.items, products);
  } catch (error) {
    const detail = error?.response?.data?.error?.message || error?.message;
    console.error("[render] fraction hotspot pass failed, returning the render without hover:", detail || "");
    return [];
  }
}

/**
 * Grid pass first; fraction pass if it throws. Both are best effort, so this
 * never rejects. Takes the PNG bytes because the grid is drawn in memory.
 */
async function locateProducts(renderPng, renderUrl, products) {
  try {
    const hotspots = await locateOnGrid(renderPng, products);
    if (hotspots.length > 0) return hotspots;
    console.warn("[render] grid pass found nothing, trying the fraction pass");
  } catch (error) {
    const detail = error?.response?.data?.error?.message || error?.message;
    console.error("[render] grid hotspot pass failed, falling back to fractions:", detail || "");
  }
  return locateProductsByFraction(renderUrl, products);
}

/** Drops missing or degenerate boxes and clamps the rest into the image. */
function normalizeHotspots(items, products) {
  if (!Array.isArray(items)) return [];
  const idFor = new Map(products.map((p) => [String(p.category).toLowerCase(), String(p.id)]));
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const category = String(it?.category || "").trim().toLowerCase();
    if (!it?.found || !idFor.has(category) || seen.has(category)) continue;
    const x = Number(it.x), y = Number(it.y), w = Number(it.w), h = Number(it.h);
    if (![x, y, w, h].every(Number.isFinite)) continue;
    const cx = Math.min(1, Math.max(0, x));
    const cy = Math.min(1, Math.max(0, y));
    const cw = Math.min(1 - cx, Math.max(0, w));
    const ch = Math.min(1 - cy, Math.max(0, h));
    // Anything under 1% of the frame is noise, not a sofa.
    if (cw < 0.01 || ch < 0.01) continue;
    seen.add(category);
    out.push({ category, itemId: idFor.get(category), x: cx, y: cy, w: cw, h: ch });
  }
  return out;
}

/**
 * Full pipeline. `items` are the validated product summaries from the route.
 * Resolves the render document to store on the room.
 */
async function renderRoom({ photoUrl, items, layoutHints = [], existingFurniture = [] }) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  const startedAt = Date.now();

  const roomImage = await downloadImage(photoUrl);
  if (!roomImage) throw new Error("Could not fetch the room photo");

  // Fetch references in parallel; a dead thumbnail drops that product from the
  // prompt rather than failing the render.
  const fetched = await Promise.all(items.slice(0, MAX_REFERENCE_IMAGES).map(async (item) => ({
    item,
    image: await downloadImage(item.imageUrl),
  })));
  const usable = fetched.filter((f) => f.image);
  if (usable.length === 0) throw new Error("None of the product images could be fetched");
  if (usable.length < fetched.length) {
    console.warn(`[render] skipped ${fetched.length - usable.length} product(s) with unreachable images`);
  }

  const products = usable.map((f) => f.item);
  const prompt = buildEditPrompt({ products, layoutHints, existingFurniture });
  const size = await pickSize(roomImage);
  const png = await editImage({ roomImage, references: usable.map((f) => f.image), prompt, size });
  const url = await uploadToCloudinary(png, "image/png", "bluprint/renders");
  console.log("[render] image ready in", Date.now() - startedAt, "ms");

  const hotspots = await locateProducts(png, url, products);
  console.log("[render] done in", Date.now() - startedAt, "ms with", hotspots.length, "hotspot(s)");

  return {
    url,
    createdAt: new Date().toISOString(),
    itemIds: products.map((p) => String(p.id)),
    hotspots,
    // Stored so a revisit can show hover cards without refetching furniture.
    items: products.map((p) => ({
      id: String(p.id),
      category: p.category,
      name: p.name,
      brand: p.brand || "",
      price: Number(p.price) || 0,
      imageUrl: p.imageUrl,
      buyUrl: p.buyUrl,
    })),
  };
}

/**
 * Locate passes only, on a render that already exists. Fetches the saved
 * image back from Cloudinary (our own URL, still through the guarded agent)
 * and uses the product summaries stored with the render.
 */
async function relocateRender(render) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  const image = await downloadImage(render.url);
  if (!image) throw new Error("Could not fetch the saved render");
  const products = render.items.filter((p) => p && p.category && p.imageUrl);
  if (products.length === 0) throw new Error("The render has no products to locate");
  const startedAt = Date.now();
  const hotspots = await locateProducts(image.buffer, render.url, products);
  console.log("[render] hotspots refreshed in", Date.now() - startedAt, "ms:", hotspots.length, "found");
  return hotspots;
}

module.exports = { renderRoom, relocateRender, buildEditPrompt, normalizeHotspots, pickSize, editImage, rejectsInputFidelity, MAX_REFERENCE_IMAGES };
