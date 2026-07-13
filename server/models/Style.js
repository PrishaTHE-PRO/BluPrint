const mongoose = require("mongoose");


const StyleSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    source: { type: String, enum: ["user", "ai"], required: true },

    roomType: { type: String }, // e.g. "Bedroom" or a custom "Other" value
    styleTag: { type: String }, // e.g. "scandinavian"
    colorPalette: { type: [String], default: [] }, // ["#E7DECD", ...]

    // AI-only fields. Harmless on a user doc.
    moodTags: { type: [String], default: [] },
    roomFeatures: { type: [String], default: [] },
    confidence: { type: Number },
  },
  { timestamps: true }
);

StyleSchema.index({ roomId: 1, source: 1 }, { unique: true });

module.exports = mongoose.model("Style", StyleSchema);