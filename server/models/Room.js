const mongoose = require('mongoose');

// This is our blueprint for a Room index card!
const RoomSchema = new mongoose.Schema({
    userId: { type: String, required: true },   // Who owns this room?
    name: { type: String, required: true },     // What is it called?
    widthFt: { type: Number, required: true },  // How wide is it?
    lengthFt: { type: Number, required: true }, // How long is it?
    heightFt: { type: Number, required: true }, // How tall is it?
    sqft: { type: Number, required: true },     // Total floor space!
    layout: { type: mongoose.Schema.Types.Mixed, default: null } // 2D room preview snapshot
}, { timestamps: true }); // This automatically adds the date it was made!

module.exports = mongoose.model('Room', RoomSchema);
