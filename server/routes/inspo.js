const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const InspirationImage = require("../models/InspirationImage");
const Style = require("../models/Style");
const { scrapePinterestBoard } = require("../services/pinterestScraper");

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadToCloudinary(buffer, mimetype) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "image", folder: "bluprint" },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

function normalizeColorPalette(palette) {
  if (!Array.isArray(palette)) return [];
  return palette
    .map((item) => {
      const raw = typeof item === "string" ? item : item && item.hex;
      if (!raw) return null;
      const match = String(raw).trim().match(/^#?[0-9a-f]{6}$/i);
      return match ? (match[0].startsWith("#") ? match[0] : `#${match[0]}`).toUpperCase() : null;
    })
    .filter(Boolean);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
});

/* -------- Pinterest (priority) --------
 * POST /api/rooms/:roomId/pinterest   body: { boardUrl }
 */
router.post("/:roomId/pinterest", async (req, res) => {
  try {
    const urls = await scrapePinterestBoard(req.body.boardUrl, { limit: 8 });
    const docs = await InspirationImage.insertMany(
      urls.map((url) => ({ roomId: req.params.roomId, source: "pinterest", url }))
    );
    res.json(docs);
  } catch (e) {
    const status = e.code === "INVALID_URL" ? 400 : 502;
    res.status(status).json({ error: e.message, code: e.code || "SCRAPE_FAILED" });
  }
});

/* -------- Direct upload (fallback) --------
 * POST /api/rooms/:roomId/images   multipart/form-data, field "images" (<=3)
 */
router.post("/:roomId/images", upload.array("images", 3), async (req, res) => {
  try {
    const urls = await Promise.all(
      (req.files || []).map((f) => uploadToCloudinary(f.buffer, f.mimetype))
    );
    const docs = await InspirationImage.insertMany(
      urls.map((url) => ({
        roomId: req.params.roomId,
        source: "upload",
        url,
      }))
    );
    res.json(docs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Upload failed" });
  }
});

/* POST /api/rooms/:roomId/images/url  body: { url } */
router.post("/:roomId/images/url", async (req, res) => {
  try {
    const url = String(req.body.url || "").trim();
    if (!/^https?:\/\/\S+/i.test(url)) {
      return res.status(400).json({ error: "A valid image URL is required" });
    }

    const doc = await InspirationImage.findOneAndUpdate(
      { roomId: req.params.roomId, url },
      {
        $setOnInsert: {
          roomId: req.params.roomId,
          source: "url",
          url,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json(doc);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not save image URL" });
  }
});

/* GET /api/rooms/:roomId/images  — all inspo images for a room */
router.get("/:roomId/images", async (req, res) => {
  const docs = await InspirationImage.find({ roomId: req.params.roomId }).sort("createdAt");
  res.json(docs);
});

/* DELETE /api/rooms/:roomId/images/:imageId */
router.delete("/:roomId/images/:imageId", async (req, res) => {
  await InspirationImage.deleteOne({ _id: req.params.imageId, roomId: req.params.roomId });
  res.json({ ok: true });
});

/* -------- Style + palette (user pick) --------
 * POST /api/rooms/:roomId/style   body: { styleTag, colorPalette }
 * Upserts the source:"user" style doc for this room.
 */
router.post("/:roomId/style", async (req, res) => {
  try {
    const doc = await Style.findOneAndUpdate(
      { roomId: req.params.roomId, source: "user" },
      {
        roomId: req.params.roomId,
        source: "user",
        roomType: req.body.roomType,
        styleTag: req.body.styleTag,
        colorPalette: normalizeColorPalette(req.body.colorPalette),
        moodTags: normalizeStringArray(req.body.moodTags),
        roomFeatures: normalizeStringArray(req.body.roomFeatures),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json(doc);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not save style" });
  }
});

/* GET /api/rooms/:roomId/style — returns user pick (and AI result if present) */
router.get("/:roomId/style", async (req, res) => {
  const docs = await Style.find({ roomId: req.params.roomId });
  res.json(docs);
});

/* -------- Budget --------
 * PATCH /api/rooms/:roomId/budget   body: { budgetTotal }
 * Writes budgetTotal onto the ROOM document (Saanvi's `rooms` collection).
 * NOTE: this depends on Saanvi's Room model being registered. If it isn't yet,
 * you'll get a clear 501 below. Team decision: keep this here, or fold it into
 * Saanvi's room-update route — either is fine, just pick one owner.
 */
router.patch("/:roomId/budget", async (req, res) => {
  let Room;
  try {
    Room = mongoose.model("Room");
  } catch {
    return res.status(501).json({
      error:
        "Room model isn't registered yet. Budget saves onto the room doc, so this needs Saanvi's Room model loaded first.",
    });
  }
  try {
    const budgetTotal = Number(req.body.budgetTotal);
    if (!Number.isFinite(budgetTotal) || budgetTotal < 0) {
      return res.status(400).json({ error: "Budget must be a positive number" });
    }
    const room = await Room.findByIdAndUpdate(
      req.params.roomId,
      { budgetTotal },
      { returnDocument: "after", runValidators: true }
    );
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json(room);
  } catch (e) {
    res.status(500).json({ error: "Could not save budget" });
  }
});

module.exports = router;
