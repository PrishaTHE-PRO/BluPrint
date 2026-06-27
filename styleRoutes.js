import express from "express";
import RoomImage from "../models/RoomImage.js";
import StyleAnalysis from "../models/StyleAnalysis.js";
import { analyzeImages } from "../services/styleAnalyzer.js";

const router = express.Router();

router.post("/rooms/:roomId/analyze-style", async (req, res) => {
  try {
    const { roomId } = req.params;

    const images = await RoomImage.find({ roomId });

    // 404 if no images exist yet
    if (images.length === 0) {
      return res.status(404).json({ error: "No images found for this room" });
    }

    // Fix: handle base64 images so Vision API accepts them
    const imageUrls = images.map(img => {
      if (img.source === "pin") return img.url;
      return img.data.startsWith("data:") ? img.data : `data:image/jpeg;base64,${img.data}`;
    });

    const analysis = await analyzeImages(imageUrls);

    // Fix: upsert so Prisha always gets one clean doc per room
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

export default router;
