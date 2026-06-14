const mongoose = require("mongoose");

const StyleAnalysisSchema = new mongoose.Schema({
  roomId:       String,
  styleTag:     String,
  moodTags:     [String],
  colorPalette: [String],
  roomFeatures: [String],
  confidence:   Number,
  analyzedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("StyleAnalysis", StyleAnalysisSchema);
