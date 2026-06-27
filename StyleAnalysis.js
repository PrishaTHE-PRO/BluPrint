import mongoose from "mongoose";

const StyleAnalysisSchema = new mongoose.Schema({
  roomId: String,

  styleTag: String,

  moodTags: [String],

  colorPalette: [String],

  roomFeatures: [String],

  confidence: Number,

  analyzedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model(
  "StyleAnalysis",
  StyleAnalysisSchema
);
