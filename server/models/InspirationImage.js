const mongoose = require("mongoose");

const InspirationImageSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    source: { type: String, enum: ["pinterest", "upload"], required: true },
    url: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("InspirationImage", InspirationImageSchema);