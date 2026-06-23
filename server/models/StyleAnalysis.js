const mongoose = require("mongoose");

const UserPicksSchema = new mongoose.Schema(
  {
    styleTag: { type: String },
    moodTag: { type: String },
    colorPalette: { type: [String], default: [] },
    roomFeatures: { type: [String], default: [] },
  },
  { _id: false }
);

const StyleAnalysisSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    styleTag: { type: String },
    moodTags: { type: [String], default: [] },
    colorPalette: { type: [String], default: [] },
    roomFeatures: { type: [String], default: [] },
    confidence: { type: Number },
    userPicks: { type: UserPicksSchema, default: () => ({}) },
    imageIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "InspirationImage" }],
    analyzedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

StyleAnalysisSchema.index({ roomId: 1 }, { unique: true });

module.exports = mongoose.model("StyleAnalysis", StyleAnalysisSchema);
