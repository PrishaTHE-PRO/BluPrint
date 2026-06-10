import express from "express";
import RoomImage from "../models/RoomImage.js";
import StyleAnalysis from "../models/StyleAnalysis.js";

import {
  analyzeImages
} from "../services/styleAnalyzer.js";

const router = express.Router();

router.post(
  "/rooms/:roomId/analyze-style",
  async (req, res) => {

    try {

      const roomId =
        req.params.roomId;
        const images =
        await RoomImage.find({
          roomId
        });
            const imageUrls =
        images.map(img => {

          if (img.source === "pin") {
            return img.url;
          }

          return img.data;
        });
            const analysis =
        await analyzeImages(
          imageUrls
        );
            const saved =
        await StyleAnalysis.create({
          roomId,

          ...analysis
        });
            res.json(saved);

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error:
          "Failed to analyze room"
      });
    }
  }
);
