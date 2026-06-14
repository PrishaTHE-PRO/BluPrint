const mongoose = require("mongoose");

const InspirationImageSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    source: { type: String, enum: ["pinterest", "upload", "url"], required: true },
    url: { type: String }, // pinterest CDN url
    data: { type: String }, // base64 data URI (uploads only)
    mimeType: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("InspirationImage", InspirationImageSchema);
