const express        = require("express");
const InspirationImage = require("../models/InspirationImage");
const StyleAnalysis  = require("../models/StyleAnalysis");
const { analyzeImages } = require("../services/styleAnalyzer");

const router = express.Router();

// POST /api/rooms/:roomId/analyze-style
router.post("/:roomId/analyze-style", async (req, res) => {
  try {
    const { roomId } = req.params;

    const images = await InspirationImage.find({ roomId });

    if (images.length === 0) {
      return res.status(404).json({ error: "No images found for this room" });
    }

    const imageUrls = images.map(img => img.url).filter(Boolean);

    const analysis = await analyzeImages(imageUrls);

    const saved = await StyleAnalysis.findOneAndUpdate(
      { roomId },
      { roomId, ...analysis, analyzedAt: new Date() },
      { upsert: true, new: true }
    );

    res.json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to analyze room" });
  }
});

module.exports = router;
