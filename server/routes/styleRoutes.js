const express = require("express");
const InspirationImage = require("../models/InspirationImage");
const Style = require("../models/Style");
const StyleAnalysis = require("../models/StyleAnalysis");
const { analyzeImages, normalizeHex } = require("../services/styleAnalyzer");

const router = express.Router();

function imageToVisionSource(image) {
  if (image.url) return image.url;
  if (image.data) return image.data.startsWith("data:") ? image.data : `data:image/jpeg;base64,${image.data}`;
  return null;
}

function normalizeUserPicks(userPicks = {}) {
  return {
    styleTag: userPicks.styleTag || "",
    moodTag: userPicks.moodTag || "",
    colorPalette: Array.isArray(userPicks.colorPalette)
      ? userPicks.colorPalette.map(normalizeHex).filter(Boolean)
      : [],
    roomFeatures: Array.isArray(userPicks.roomFeatures)
      ? userPicks.roomFeatures.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
  };
}

router.post("/:roomId/analyze-style", async (req, res) => {
  try {
    const { roomId } = req.params;
    const images = await InspirationImage.find({ roomId }).sort("createdAt");
    const imageUrls = images.map(imageToVisionSource).filter(Boolean);

    if (imageUrls.length === 0) {
      return res.status(404).json({ error: "No inspiration images found for this room" });
    }

    const analysis = await analyzeImages(imageUrls);
    const userPicks = normalizeUserPicks(req.body.userPicks);

    const saved = await StyleAnalysis.findOneAndUpdate(
      { roomId },
      {
        roomId,
        ...analysis,
        userPicks,
        imageIds: images.map((image) => image._id),
        analyzedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await Style.findOneAndUpdate(
      { roomId, source: "ai" },
      {
        roomId,
        source: "ai",
        styleTag: analysis.styleTag,
        colorPalette: analysis.colorPalette,
        moodTags: analysis.moodTags,
        roomFeatures: analysis.roomFeatures,
        confidence: analysis.confidence,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json(saved);
  } catch (error) {
    console.error("Style analysis error:", error.message);
    res.status(error.status || 500).json({
      error: error.status && error.status < 500 ? error.message : "Failed to analyze room",
      code: error.code || "STYLE_ANALYSIS_FAILED",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  }
});

router.get("/:roomId/analyze-style", async (req, res) => {
  const analysis = await StyleAnalysis.findOne({ roomId: req.params.roomId });
  if (!analysis) return res.status(404).json({ error: "No style analysis found for this room" });
  res.json(analysis);
});

module.exports = router;
