const express = require("express");
const multer = require("multer");
const InspoBoard = require("../models/InspoBoard");
const { scrapePinterestBoard } = require("../services/pinterestScraper");

const router = express.Router();

// Keep uploads in memory; we convert to base64 and store in Mongo.
// 5MB per file cap so we stay well under the 16MB document limit.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/**
 * POST /api/inspo
 * Create a new inspo board (optionally linked to a room) OR update prefs.
 * Body: { roomId?, userId?, budget?, style?, colorPalette?, paletteId?, wildcard? }
 */
router.post("/", async (req, res) => {
  try {
    const { id, ...fields } = req.body;
    let board;
    if (id) {
      board = await InspoBoard.findByIdAndUpdate(id, fields, { new: true });
      if (!board) return res.status(404).json({ error: "Board not found" });
    } else {
      board = await InspoBoard.create(fields);
    }
    res.json(board);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not save inspo board" });
  }
});

/** GET /api/inspo/:id */
router.get("/:id", async (req, res) => {
  try {
    const board = await InspoBoard.findById(req.params.id);
    if (!board) return res.status(404).json({ error: "Board not found" });
    res.json(board);
  } catch (e) {
    res.status(500).json({ error: "Could not load board" });
  }
});

/**
 * POST /api/inspo/:id/images/upload  (multipart/form-data, field name "images")
 * Stores each uploaded file as a base64 data URI inside the document.
 */
router.post("/:id/images/upload", upload.array("images", 12), async (req, res) => {
  try {
    const board = await InspoBoard.findById(req.params.id);
    if (!board) return res.status(404).json({ error: "Board not found" });

    const added = (req.files || []).map((f) => ({
      source: "upload",
      mimeType: f.mimetype,
      data: `data:${f.mimetype};base64,${f.buffer.toString("base64")}`,
    }));

    board.images.push(...added);
    await board.save();
    res.json(board);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Upload failed" });
  }
});

/**
 * POST /api/inspo/:id/images/pinterest
 * Body: { boardUrl }
 * Scrapes the public board and stores image CDN URLs.
 */
router.post("/:id/images/pinterest", async (req, res) => {
  try {
    const board = await InspoBoard.findById(req.params.id);
    if (!board) return res.status(404).json({ error: "Board not found" });

    const urls = await scrapePinterestBoard(req.body.boardUrl, { limit: 24 });
    const added = urls.map((url) => ({ source: "pinterest", url }));
    board.images.push(...added);
    await board.save();
    res.json(board);
  } catch (e) {
    // Surface a friendly, specific message so the UI can tell the user to
    // fall back to manual upload instead of just failing silently.
    const status = e.code === "INVALID_URL" ? 400 : 502;
    res.status(status).json({ error: e.message, code: e.code || "SCRAPE_FAILED" });
  }
});

/** DELETE /api/inspo/:id/images/:imageId */
router.delete("/:id/images/:imageId", async (req, res) => {
  try {
    const board = await InspoBoard.findById(req.params.id);
    if (!board) return res.status(404).json({ error: "Board not found" });
    board.images.id(req.params.imageId)?.deleteOne();
    await board.save();
    res.json(board);
  } catch (e) {
    res.status(500).json({ error: "Could not remove image" });
  }
});

module.exports = router;