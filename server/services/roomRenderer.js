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
const { describeLayout } = require("./planFromPicture");

const IMAGE_EDIT_URL = "https://api.openai.com/v1/images/edits";
const CHAT_URL = "https://api.openai.com/v1/chat/completions";

// Tried in order until the edits endpoint accepts one. gpt-image-1 was the
// original default; it is still listed by the models endpoint but the edits
// endpoint now answers "The model 'gpt-image-1' does not exist", which is what
// a model looks like once it is retired. OPENAI_IMAGE_MODEL, when set, is
// tried first. The first model that works is remembered for the process.
const IMAGE_MODEL_CANDIDATES = [
  "gpt-image-1.5",
  "gpt-image-2.5-flare",
  "gpt-image-2",
  "gpt-image-2.5-sunburst",
  "gpt-image-1",
  "gpt-image-1-mini",
];
const DEFAULT_IMAGE_MODEL = IMAGE_MODEL_CANDIDATES[0];
let workingImageModel = null;
const DEFAULT_IMAGE_SIZE = "1536x1024";
// High, not medium: on the same room photo, medium redrew the room (a
// column and a radiator gone, a wider frame, the camera moved) while high
// kept all of them. Holding the room is the whole point, so it is worth
// the longer wait and the higher per-image cost. OPENAI_IMAGE_QUALITY still
// overrides it.
const DEFAULT_IMAGE_QUALITY = "high";
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
 * Phone photos often carry their orientation in EXIF rather than in the
 * pixels. Bake it in first so the size pick and the crop see the photo the
 * way the user does. Falls back to the original bytes if that fails.
 */
async function uprightImage(roomImage) {
  try {
    const buffer = await sharp(roomImage.buffer).rotate().png().toBuffer();
    return { buffer, contentType: "image/png" };
  } catch (error) {
    console.warn("[render] could not normalise the photo's orientation:", error?.message || "");
    return roomImage;
  }
}

/**
 * Crops the photo, centred, to the exact aspect of the output size. The edit
 * endpoint returns the output size whatever it is given, so a 4:3 photo sent
 * to a 3:2 output had to be stretched or reframed by the model, and that
 * alone changed the walls, the floor and the window positions before any
 * furniture went in. With the input already at the output aspect the model
 * has nothing to reframe. The trimmed strip is at most a few percent of one
 * edge. Falls back to the original bytes if the crop fails.
 */
async function cropToSize(roomImage, size) {
  const match = /^(\d+)x(\d+)$/.exec(String(size || ""));
  if (!match) return roomImage;
  const targetRatio = Number(match[1]) / Number(match[2]);
  try {
    const img = sharp(roomImage.buffer);
    const { width, height } = await img.metadata();
    if (!width || !height) return roomImage;
    const ratio = width / height;
    let cropW = width, cropH = height;
    if (ratio > targetRatio + 0.005) cropW = Math.round(height * targetRatio);
    else if (ratio < targetRatio - 0.005) cropH = Math.round(width / targetRatio);
    const left = Math.floor((width - cropW) / 2);
    const top = Math.floor((height - cropH) / 2);
    const buffer = await img.extract({ left, top, width: cropW, height: cropH }).png().toBuffer();
    if (cropW !== width || cropH !== height) {
      console.log(`[render] photo ${width}x${height} cropped to ${cropW}x${cropH} to match the ${size} output`);
    }
    return { buffer, contentType: "image/png" };
  } catch (error) {
    console.warn("[render] could not crop the photo to the output aspect:", error?.message || "");
    return roomImage;
  }
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

  // Existing pieces arrive as { label, category, keep } (older rooms: plain
  // strings, treated as kept). Kept pieces stay exactly as they are; a piece
  // the user marked for replacement is swapped for the product of the same
  // category, and only that one.
  const existing = (Array.isArray(existingFurniture) ? existingFurniture : [])
    .map((f) => (f && typeof f === "object" ? f : { label: String(f || ""), category: "other", keep: true }))
    .filter((f) => f.label);
  const kept = existing.filter((f) => f.keep !== false);
  const toReplace = existing.filter((f) => f.keep === false);
  const replacementFor = new Map(toReplace.map((f) => [String(f.category).toLowerCase(), f.label]));

  const lines = products.map((p, i) => {
    const hint = hintFor.get(String(p.category).toLowerCase());
    const placement = hint ? ` Placement: ${hint.replace(/^[^:]+:\s*/, "")}.` : "";
    const replaces = replacementFor.get(String(p.category).toLowerCase());
    const swap = replaces ? ` This replaces the existing ${replaces}: remove that piece and put this one in its place.` : "";
    return `${i + 1}. ${p.name}${p.brand ? ` by ${p.brand}` : ""} (reference image ${i + 2}).${placement}${swap}`;
  });

  const removal = kept.length
    ? `The room already contains: ${kept.map((f) => f.label).join(", ")}. Keep every one of these exactly where it is, unchanged. Do not remove, move, restyle or recolour them. The new products are added alongside them.`
    : (toReplace.length
      ? "Apart from the pieces named below as replacements, do not remove or move anything already in the room."
      : "Do not remove or move anything already in the room; the new products are added to it.");

  return [
    "The first image is a photograph of the user's actual room. The result must be that same photograph with the products listed below added into it, and nothing else changed. This is not a new picture inspired by the photo and not a redesign of the room.",
    "The room itself is off limits. Reproduce it exactly as photographed: the same walls in the same places with the same colour and finish, the same floor with the same material and pattern, the same ceiling, the same windows and doors in the same positions and sizes with the same view through them, the same curtains, blinds, radiators, vents, outlets, switches, baseboards, trim, light fixtures, wall art, plants, rugs, decor and objects on surfaces, the same time of day and lighting, and the same camera position, angle, lens and framing. Do not add, remove, enlarge, shrink or move any window, door, wall or architectural feature. Do not repaint, restyle, clean up, brighten, crop, zoom or reframe the room. Do not change the room's size or proportions.",
    "Treat the camera as standing at the front of the room looking toward the back wall. Placement notes below are given from that viewpoint: left and right as seen in the photo, back meaning near the far wall, front meaning near the camera.",
    removal,
    "Place each of the following products in the room where there is floor space for it, matching its reference image as closely as possible in shape, colour, and material, at a realistic size for the room. A product may only cover what sits directly behind it from the camera's view; it must not alter anything around it:",
    ...lines,
    "Photorealistic result with perspective, shadows and lighting consistent with the original photo. No text, labels, or watermarks.",
    "Final check: everything outside the newly added products must be identical to the first image, pixel for pixel wherever possible.",
  ].join("\n");
}

/** Builds the multipart body. `inputFidelity` null leaves the field out. */
function buildEditForm({ roomImage, references, prompt, size, inputFidelity, model }) {
  const form = new FormData();
  form.append("model", model || DEFAULT_IMAGE_MODEL);
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

/** True when the endpoint says the model itself is unknown or unavailable. */
function rejectsModel(status, message) {
  // Loose on purpose: "The model 'x' does not exist", "The model does not
  // exist", and the access variants all count. Only the status narrows it.
  return (status === 400 || status === 404)
    && /\bmodel\b[^.]*\bdoes not exist|model_not_found|does not have access to (the )?model|not supported for this endpoint/i.test(String(message || ""));
}

/** Models to try, in order: a pinned one first, then the candidates. */
function imageModelsToTry() {
  const pinned = String(process.env.OPENAI_IMAGE_MODEL || "").trim();
  const list = pinned ? [pinned, ...IMAGE_MODEL_CANDIDATES.filter((m) => m !== pinned)] : [...IMAGE_MODEL_CANDIDATES];
  // The model that worked last time goes first so a render does not pay
  // for a failed attempt on every call.
  if (workingImageModel && list.includes(workingImageModel)) {
    return [workingImageModel, ...list.filter((m) => m !== workingImageModel)];
  }
  return list;
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
  const models = imageModelsToTry();
  let lastError = null;

  for (const model of models) {
    try {
      const png = await postEditWithFidelityFallback({ roomImage, references, prompt, size, model, fidelity });
      if (workingImageModel !== model) console.log(`[render] using image model ${model}`);
      workingImageModel = model;
      return png;
    } catch (error) {
      if (!rejectsModel(error?.status, error?.message)) throw error;
      // This model is gone or not available to this key: on to the next.
      console.warn(`[render] image model ${model} unavailable (${error.message}); trying the next`);
      if (workingImageModel === model) workingImageModel = null;
      lastError = error;
    }
  }
  const err = new Error(`No usable image model. Tried ${models.join(", ")}. Last error: ${lastError?.message || "unknown"}`);
  err.status = lastError?.status || 502;
  throw err;
}

/** One model: with input_fidelity, then once without if the model refuses it. */
async function postEditWithFidelityFallback({ roomImage, references, prompt, size, model, fidelity }) {
  try {
    return await postEdit(buildEditForm({ roomImage, references, prompt, size, model, inputFidelity: fidelity }));
  } catch (error) {
    if (!fidelity || !rejectsInputFidelity(error?.status, error?.message)) throw error;
    console.warn(`[render] ${model} rejected input_fidelity, retrying without it. The room will be held less faithfully.`);
    return postEdit(buildEditForm({ roomImage, references, prompt, size, model, inputFidelity: null }));
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
    const result = await locateOnGrid(renderPng, products);
    if (result.hotspots.length > 0) return result;
    console.warn("[render] grid pass found nothing, trying the fraction pass");
  } catch (error) {
    const detail = error?.response?.data?.error?.message || error?.message;
    console.error("[render] grid hotspot pass failed, falling back to fractions:", detail || "");
  }
  return { hotspots: await locateProductsByFraction(renderUrl, products), floor: null };
}

// Pieces that hang on a wall rather than stand on the floor. Their box's
// bottom edge says nothing about depth, so they are placed against the back
// wall at the x position where they appear.
const WALL_MOUNTED = new Set([
  "wall_art", "floating_shelves", "pendant_light", "dining_light", "bath_light",
  "smart_lighting", "bath_mirror", "kitchen_shelf", "nursery_shelf", "wall_shelf",
]);
// Pieces with a front: turned to face into the room from whichever half
// they sit in. RoomSVG's rotation 0 faces the front (camera) side.
const FACING = new Set(["sofa", "bed", "accent_chair", "dining_chair", "office_chair", "rocking_chair", "desk", "crib", "reading_nook"]);
// Typical doorway shot when the locate pass could not find the back wall.
const DEFAULT_FLOOR = { backLeft: { x: 0.15, y: 0.45 }, backRight: { x: 0.85, y: 0.45 } };
// Image rows near the bottom cover less floor than rows near the back wall;
// a mild curve on the depth fraction corrects most of that without a camera.
const DEPTH_GAMMA = 0.7;
// The floor line is read off a 12 x 8 grid as a cell centre, while a box
// ends at a cell edge, so a piece flush against the back wall shows half a
// row (about 6% of the image) of depth that is not there. Within that band,
// snap to the wall.
const BACK_WALL_SNAP = 0.07;

// RoomSVG's rotation 0 faces the camera (the front wall, at the bottom of
// the plan); rotation runs clockwise, so 90 faces the left wall.
const ROTATION_FOR_FACING = { camera: 0, "back wall": 180, "left wall": 90, "right wall": 270 };
// What a wall-hung piece faces, given the wall it hangs on.
const FACING_FROM_WALL = { "back wall": "camera", "front wall": "back wall", "left wall": "right wall", "right wall": "left wall" };

/**
 * A plan position from the picture pass: centre in feet plus the wall the
 * piece touches and the way it faces. Snaps a piece that touches a wall
 * flush against it and keeps the footprint inside the room.
 */
// Low, deep pieces whose far end shows where they stand: when the box reaches
// up past the back wall's floor line, the piece is against that wall.
const REACHES_WALL = new Set(["bed", "crib", "daybed", "toddler_bed", "bunk_bed"]);

function placementFromReading({ h, read, kind, wall, wFt, dFt, W, L, yBack = null }) {
  let touching = read.touching;
  // Wall-hung pieces with no wall named go where they always went: the back wall.
  if (wall && touching === "none") touching = "back wall";
  // The model tends to call a bed free-standing even with its head on the
  // wall; the located box settles it.
  if (touching === "none" && REACHES_WALL.has(kind) && yBack != null && h.y <= yBack + 0.03) touching = "back wall";
  let rotation;
  if (touching !== "none") {
    // Anything on a wall has its back to that wall: a picture hangs flat on
    // it, a dresser or bed stands against it with its front into the room.
    // That beats whatever the model said about the front or the long side.
    rotation = ROTATION_FOR_FACING[FACING_FROM_WALL[touching] || "camera"];
  } else if (FACING.has(kind)) {
    rotation = ROTATION_FOR_FACING[read.facing] ?? 0;
  } else {
    // No front to speak of (a rug, a table): turn it only when its longer
    // side runs the other way from how it is listed.
    const listedAcross = wFt >= dFt;
    const seenAcross = read.longSide === "across";
    rotation = read.longSide && read.longSide !== "square" && listedAcross !== seenAcross ? 90 : 0;
  }
  const sideways = rotation === 90 || rotation === 270;
  // The footprint turns with the piece, so the clamp uses the turned size.
  const wEff = sideways ? dFt : wFt;
  const dEff = sideways ? wFt : dFt;
  let cx = read.cx;
  let cy = read.cy;
  // Flush against the wall; a hung piece sits a hair off it so it draws.
  const off = wall ? 0.1 : 0;
  if (touching === "back wall") cy = dEff / 2 + off;
  else if (touching === "front wall") cy = L - dEff / 2 - off;
  else if (touching === "left wall") cx = wEff / 2 + off;
  else if (touching === "right wall") cx = W - wEff / 2 - off;
  cx = Math.min(Math.max(wEff / 2, cx), Math.max(wEff / 2, W - wEff / 2));
  cy = Math.min(Math.max(dEff / 2, cy), Math.max(dEff / 2, L - dEff / 2));
  // Corners are for the unturned footprint; the plan rotates about the centre.
  const placement = {
    category: h.category,
    itemId: h.itemId,
    x: Math.round(Math.max(0, cx - wFt / 2) * 10) / 10,
    y: Math.round(Math.max(0, cy - dFt / 2) * 10) / 10,
    cx: Math.round(cx * 10) / 10,
    cy: Math.round(cy * 10) / 10,
    approx: false,
    source: "picture",
    touching,
  };
  placement.rotation = rotation;
  return placement;
}

/**
 * Projects each located product from the picture onto the floor plan.
 *
 * The floor in the photo is taken to be the trapezoid between the back
 * wall's floor line and the bottom edge of the image, with the near corners
 * at the image's bottom corners (where a doorway shot puts them). A product's
 * floor-contact point is the bottom centre of its box: its depth is how far
 * down that trapezoid it sits, its left-to-right position is where it falls
 * between the floor's edges at that depth. Plan x runs left to right across
 * the back wall; plan y runs from the back wall (0) to the camera (lengthFt).
 *
 * This is deliberately a geometric estimate rather than a reconstruction: a
 * plan that puts the sofa on the correct wall at the correct side, in the
 * right order relative to everything else, is what matching the picture
 * means here. Positions are top-left corners in feet, clamped to the room.
 */
function projectToPlan({ hotspots, floor, products, room, layout = null }) {
  const W = Number(room?.widthFt) || 0;
  const L = Number(room?.lengthFt) || 0;
  if (!W || !L || !Array.isArray(hotspots) || hotspots.length === 0) return [];
  const f = floor || DEFAULT_FLOOR;
  const approx = !floor;
  const yBack = (f.backLeft.y + f.backRight.y) / 2;
  const byCategory = new Map(products.map((p) => [String(p.category).toLowerCase(), p]));
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  const placed = hotspots.map((h) => {
    const product = byCategory.get(h.category) || {};
    // Existing pieces are located under a unique key (one per piece) and
    // carry their real category as `kind`; products use their category.
    const kind = String(product.kind || h.category).toLowerCase();
    const wFt = Math.max(0.5, (Number(product.widthIn) || 30) / 12);
    const dFt = Math.max(0.5, (Number(product.depthIn) || 30) / 12);
    const wall = WALL_MOUNTED.has(kind);

    // The picture pass, when it placed this piece, wins over the geometry.
    const read = layout instanceof Map ? layout.get(h.category) : null;
    if (read) return placementFromReading({ h, read, kind, wall, wFt, dFt, W, L, yBack: floor ? yBack : null });

    const px = h.x + h.w / 2;
    // Floor contact: the bottom of the box, unless the piece hangs on a wall.
    const py = wall ? yBack : h.y + h.h;
    const againstBackWall = wall || py - yBack <= BACK_WALL_SNAP;
    const t = againstBackWall ? 0 : Math.pow(clamp01((py - yBack) / Math.max(0.05, 1 - yBack)), DEPTH_GAMMA);
    // The floor widens toward the camera: its edges run from the back
    // corners to the image's bottom corners.
    const xl = f.backLeft.x * (1 - t);
    const xr = f.backRight.x + (1 - f.backRight.x) * t;
    const xFrac = clamp01((px - xl) / Math.max(0.05, xr - xl));
    // Centre, then clamped so the footprint stays inside the room; the corner
    // is derived from the clamped centre so the two always agree.
    const cx = Math.min(Math.max(wFt / 2, xFrac * W), Math.max(wFt / 2, W - wFt / 2));
    const cy = Math.min(Math.max(dFt / 2, wall ? dFt / 2 + 0.1 : t * L), Math.max(dFt / 2, L - dFt / 2));
    const x = Math.max(0, cx - wFt / 2);
    const y = Math.max(0, cy - dFt / 2);
    const placement = {
      category: h.category,
      itemId: h.itemId,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      // Centre in feet as well, for callers that size the footprint themselves.
      cx: Math.round(cx * 10) / 10,
      cy: Math.round(cy * 10) / 10,
      approx,
    };
    if (FACING.has(kind)) placement.rotation = cy > L / 2 ? 180 : 0;
    return placement;
  });

  return keepCompanionsOnTheirWall({ placed, hotspots, products, layout, W, L, yBack: floor ? yBack : null });
}

// A piece that stands beside another: the wall it is on is the wall its
// anchor is on. The layout pass reads a nightstand in a corner as "left
// wall" often enough that the plan put it on a different wall from the bed.
const COMPANION_OF = {
  nightstand: ["bed"],
  bedside_lamp: ["nightstand", "bed"],
  side_table: ["sofa", "accent_chair", "reading_nook"],
  desk_lamp: ["desk", "workspace_desk"],
  floor_lamp: ["sofa", "accent_chair", "reading_nook", "bed"],
};

/**
 * Second pass over the plan: a companion whose reading named a different
 * wall from its anchor, or none, is moved onto the anchor's wall when it is
 * already close to it (within its own depth plus a stride). The anchor may be
 * a rendered product or a piece already in the photo; both carry a `kind`.
 */
function keepCompanionsOnTheirWall({ placed, hotspots, products, layout, W, L, yBack }) {
  if (!(layout instanceof Map)) return placed;
  const byCategory = new Map(products.map((p) => [String(p.category).toLowerCase(), p]));
  const kindOf = (category) => {
    const product = byCategory.get(category) || {};
    return String(product.kind || category).toLowerCase();
  };
  const wallOf = new Map();
  placed.forEach((pl) => { if (pl.touching && pl.touching !== "none") wallOf.set(kindOf(pl.category), pl.touching); });

  return placed.map((pl, i) => {
    const kind = kindOf(pl.category);
    const anchors = COMPANION_OF[kind];
    const read = layout.get(pl.category);
    if (!anchors || !read) return pl;
    const anchorWall = anchors.map((a) => wallOf.get(a)).find(Boolean);
    if (!anchorWall || pl.touching === anchorWall) return pl;
    const product = byCategory.get(pl.category) || {};
    const wFt = Math.max(0.5, (Number(product.widthIn) || 30) / 12);
    const dFt = Math.max(0.5, (Number(product.depthIn) || 30) / 12);
    const reach = Math.max(wFt, dFt) + 1.5;
    const distance = anchorWall === "back wall" ? pl.cy
      : anchorWall === "front wall" ? L - pl.cy
      : anchorWall === "left wall" ? pl.cx
      : W - pl.cx;
    if (distance > reach) return pl;
    console.log(`[plan] ${pl.category}: moved onto the ${anchorWall} beside its ${anchors.join("/")}`);
    const h = hotspots[i];
    return placementFromReading({
      h, read: { ...read, touching: anchorWall }, kind, wall: WALL_MOUNTED.has(kind), wFt, dFt, W, L, yBack,
    });
  });
}

// Footprints for the furniture already in a photo, in inches. The photo
// gives no measurements, so these are the same per-category defaults the
// plan draws the ghost footprints with (src/utils/furnitureConstraints.ts);
// the two must agree or the layout pass measures one box and the plan
// draws another.
const EXISTING_SIZES_IN = {
  sofa: [84, 36], accent_chair: [32, 32], coffee_table: [48, 24], rug: [96, 72], floor_lamp: [12, 12], side_table: [18, 18],
  bed: [60, 80], nightstand: [20, 16], dresser: [48, 18], bedroom_rug: [96, 72], wardrobe: [36, 24], bedside_lamp: [10, 10],
  bar_stool: [16, 16], pendant_light: [12, 12], kitchen_rug: [24, 60], kitchen_storage: [30, 14], island_cart: [48, 24], kitchen_shelf: [36, 12],
  vanity: [36, 21], bath_mirror: [24, 4], bath_storage: [20, 12], bath_mat: [20, 30], bath_light: [24, 8], shower_curtain: [60, 3],
  bathtub: [60, 30], standing_shower: [36, 36],
  desk: [60, 30], office_chair: [24, 24], bookshelf: [36, 14], desk_lamp: [10, 10], storage_cabinet: [24, 18], monitor_stand: [24, 12],
  dining_table: [60, 36], dining_chair: [18, 18], dining_rug: [96, 72], sideboard: [54, 18], dining_light: [18, 18], bar_cabinet: [36, 18],
  crib: [52, 28], nursery_dresser: [36, 18], rocking_chair: [28, 30], nursery_rug: [72, 60], nursery_shelf: [30, 12], nursery_lamp: [10, 10],
  reading_nook: [34, 34], smart_lighting: [12, 12], floating_shelves: [36, 10], indoor_plants: [18, 18],
  full_length_mirror: [24, 6], wall_art: [36, 4], workspace_desk: [48, 24], vanity_station: [42, 20], bookcase: [36, 14],
};

/** The kept pieces from a photo estimate, as locator products. */
function existingProducts(existingFurniture) {
  const kept = (Array.isArray(existingFurniture) ? existingFurniture : [])
    .filter((f) => f && typeof f === "object" && f.label && f.keep !== false);
  // One locator key per piece, so two chairs do not collapse into one box.
  return kept.map((f, i) => {
    const kind = String(f.category || "other").toLowerCase();
    const [widthIn, depthIn] = EXISTING_SIZES_IN[kind] || [36, 30];
    return { id: `existing-${i}`, category: `existing-${i}`, kind, name: f.label, widthIn, depthIn, existing: true };
  });
}

/** Plan positions of the existing pieces, in the shape the room stores. */
function existingEntries(placements, products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  return placements
    .filter((pl) => byId.has(pl.itemId))
    .map((pl) => {
      const p = byId.get(pl.itemId);
      const entry = { label: p.name, category: p.kind || "other", cx: pl.cx, cy: pl.cy, approx: pl.approx };
      if (pl.rotation !== undefined) entry.rotation = pl.rotation;
      return entry;
    });
}

/**
 * Where the furniture already in the room sits on the floor plan, before
 * any render exists. Locates each kept piece in the ORIGINAL photo and runs
 * the same layout pass rendered products get, so a bed with its head on
 * the back wall lands against that wall instead of mid-room (the geometric
 * fallback reads a bed's depth off the foot end, which is wrong by its whole
 * length). Pieces marked for replacement are skipped. Returns
 * [{ label, category, cx, cy, rotation?, approx }] in feet, or [] when
 * there is nothing to locate.
 */
async function locateExistingFurniture({ photoUrl, existingFurniture = [], room }) {
  const products = existingProducts(existingFurniture);
  if (!photoUrl || products.length === 0 || !room?.widthFt || !room?.lengthFt) return [];
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

  const image = await downloadImage(photoUrl);
  if (!image) throw new Error("Could not fetch the room photo");

  const startedAt = Date.now();
  const { hotspots, floor } = await locateProducts(image.buffer, photoUrl, products);
  const layout = await describeLayout({ image: image.buffer, products, hotspots, room });
  const placements = projectToPlan({ hotspots, floor, products, room, layout });
  const out = existingEntries(placements, products);
  console.log("[existing] located", out.length, "of", products.length, "existing piece(s) in", Date.now() - startedAt, "ms");
  return out;
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
async function renderRoom({ photoUrl, items, layoutHints = [], existingFurniture = [], room = null }) {
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
  const upright = await uprightImage(roomImage);
  const size = await pickSize(upright);
  const framed = await cropToSize(upright, size);
  const png = await editImage({ roomImage: framed, references: usable.map((f) => f.image), prompt, size });
  const url = await uploadToCloudinary(png, "image/png", "bluprint/renders");
  console.log("[render] image ready in", Date.now() - startedAt, "ms");

  const located = await locateAll({ image: png, imageUrl: url, products, existingFurniture, room });
  console.log("[render] done in", Date.now() - startedAt, "ms with", located.hotspots.length, "hotspot(s),", located.placements.length, "plan position(s)");

  return {
    url,
    createdAt: new Date().toISOString(),
    itemIds: products.map((p) => String(p.id)),
    hotspots: located.hotspots,
    floor: located.floor,
    // Where each product sits on the floor plan, projected from the picture,
    // so the 2D plan can be matched to what was actually rendered.
    placements: located.placements,
    // The kept pieces from the photo, read in the same pass so the plan
    // keeps everything in the same relation it has in the picture.
    existingPlacements: located.existingPlacements,
    // Stored so a revisit can show hover cards without refetching furniture.
    items: products.map((p) => ({
      id: String(p.id),
      category: p.category,
      name: p.name,
      brand: p.brand || "",
      price: Number(p.price) || 0,
      imageUrl: p.imageUrl,
      buyUrl: p.buyUrl,
      // Kept so a later re-locate can size the plan footprint without the
      // furniture search.
      widthIn: p.widthIn,
      depthIn: p.depthIn,
    })),
  };
}

/**
 * Locate passes only, on a render that already exists. Fetches the saved
 * image back from Cloudinary (our own URL, still through the guarded agent)
 * and uses the product summaries stored with the render.
 */
async function relocateRender(render, room = null, existingFurniture = []) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  const image = await downloadImage(render.url);
  if (!image) throw new Error("Could not fetch the saved render");
  const products = render.items.filter((p) => p && p.category && p.imageUrl);
  if (products.length === 0) throw new Error("The render has no products to locate");
  const startedAt = Date.now();
  const located = await locateAll({ image: image.buffer, imageUrl: render.url, products, existingFurniture, room });
  console.log("[render] hotspots refreshed in", Date.now() - startedAt, "ms:", located.hotspots.length, "found,", located.placements.length, "plan position(s)");
  return located;
}

/**
 * The locate and layout passes over a render, for the rendered products and
 * the pieces that were already in the photo together. One reading of the
 * whole room is what keeps the nightstand beside the bed on the same wall;
 * read apart, the two passes had no way to agree. Hover hotspots are
 * returned for products only; existing pieces come back as plan entries.
 */
async function locateAll({ image, imageUrl, products, existingFurniture = [], room }) {
  const existing = existingProducts(existingFurniture);
  const everything = [...products, ...existing];
  const { hotspots, floor } = await locateProducts(image, imageUrl, everything);
  const layout = await describeLayout({ image, products: everything, hotspots, room });
  const all = projectToPlan({ hotspots, floor, products: everything, room, layout });
  const existingIds = new Set(existing.map((p) => p.id));
  return {
    hotspots: hotspots.filter((h) => !existingIds.has(h.itemId)),
    floor,
    placements: all.filter((pl) => !existingIds.has(pl.itemId)),
    existingPlacements: existingEntries(all, existing),
  };
}

module.exports = { renderRoom, relocateRender, projectToPlan, locateExistingFurniture, rejectsModel, imageModelsToTry, IMAGE_MODEL_CANDIDATES, buildEditPrompt, normalizeHotspots, pickSize, editImage, rejectsInputFidelity, MAX_REFERENCE_IMAGES, DEFAULT_FLOOR };
